import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { serializeStoredImages, type StoredImage } from '../media/stored-image';
import { OruloApiClient, OruloApiError } from './orulo-api.client';
import {
  extractMediaUrls,
  idsChanged,
  mapBuildingToEmpreendimento,
} from './orulo-mapper';
import {
  decryptOruloSecret,
  encryptOruloSecret,
} from './orulo-token.crypto';
import {
  ORULO_MAX_IMAGES,
  ORULO_RECONCILE_MIN_MS,
  ORULO_TAG,
  oruloExternalKey,
} from './orulo.constants';
import type { OruloWebhookPayload } from './orulo-api.types';

@Injectable()
export class OruloSyncService implements OnModuleInit {
  private readonly logger = new Logger(OruloSyncService.name);
  private ticking = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly api: OruloApiClient,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    const hours = 6 * 60 * 60 * 1000;
    setInterval(() => {
      void this.reconcileDueConnections();
    }, hours);
    setTimeout(() => void this.reconcileDueConnections(), 60_000);
  }

  async handleWebhook(payload: OruloWebhookPayload) {
    const buildingId = Number(payload.properties?.building_id);
    const status = String(payload.properties?.status ?? '').trim();
    const clientId = payload.properties?.client_id?.trim();
    if (!Number.isFinite(buildingId) || !status) {
      this.logger.warn('Webhook Órulo sem building_id ou status.');
      return { ok: true };
    }

    const connections = await this.connectionsForEvent(clientId);
    setImmediate(() => {
      void this.processEvent(connections, buildingId, status);
    });
    return { ok: true };
  }

  async syncConnection(connectionId: string, full = true) {
    const connection = await this.prisma.tenantOruloConnection.findUnique({
      where: { id: connectionId },
    });
    if (!connection?.ativo) {
      throw new BadRequestException('Conexão Órulo inativa ou inexistente.');
    }
    if (connection.syncing) {
      return { ok: true, started: false };
    }

    await this.prisma.tenantOruloConnection.update({
      where: { id: connection.id },
      data: { syncing: true, lastError: null },
    });

    void this.runSync(connection.id, full);
    return { ok: true, started: true };
  }

  private async runSync(connectionId: string, full: boolean) {
    try {
      const connection = await this.requireConnection(connectionId);
      const token = await this.ensureClientToken(connection);
      await this.api.getConfig(token);

      const activeIds = await this.collectActiveIds(token);
      for (const buildingId of activeIds) {
        await this.upsertBuilding(connection.tenantId, token, buildingId, true);
      }

      if (connection.lastReconcileAt) {
        try {
          const after = this.updatedAfter(connection.lastReconcileAt);
          const removedIds = await this.collectRemovedIds(token, after);
          for (const buildingId of removedIds) {
            await this.softRemove(connection.tenantId, buildingId);
          }
        } catch (error) {
          this.logger.warn(
            `Órulo ids/removed ignorado: ${
              error instanceof Error ? error.message : error
            }`,
          );
        }
      }

      await this.prisma.tenantOruloConnection.update({
        where: { id: connectionId },
        data: {
          syncing: false,
          lastFullSyncAt: new Date(),
          lastReconcileAt: new Date(),
          lastError: null,
        },
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Falha na sincronização Órulo.';
      this.logger.error(message);
      await this.prisma.tenantOruloConnection.update({
        where: { id: connectionId },
        data: { syncing: false, lastError: message.slice(0, 500) },
      });
    }
  }

  private async processEvent(
    connections: { id: string; tenantId: string; clientId: string }[],
    buildingId: number,
    status: string,
  ) {
    for (const connection of connections) {
      try {
        const row = await this.requireConnection(connection.id);
        const token = await this.ensureClientToken(row);
        if (status === 'removed') {
          await this.softRemove(row.tenantId, buildingId);
          continue;
        }
        if (status === 'excluded_from_distribution') {
          await this.hardRemove(row.tenantId, buildingId);
          continue;
        }
        if (status === 'active' || status === 'added_to_distribution') {
          await this.upsertBuilding(row.tenantId, token, buildingId, false);
        }
      } catch (error) {
        if (error instanceof OruloApiError && error.status === 404) {
          continue;
        }
        this.logger.warn(
          `Órulo evento ${status} #${buildingId} tenant ${connection.tenantId}: ${
            error instanceof Error ? error.message : error
          }`,
        );
      }
    }
  }

  async upsertBuilding(
    tenantId: string,
    token: string,
    buildingId: number,
    fetchMediaAlways: boolean,
  ) {
    const building = await this.api.getBuilding(token, buildingId);
    const mapped = mapBuildingToEmpreendimento(building);
    const existing = await this.prisma.empreendimento.findFirst({
      where: { tenantId, oruloBuildingId: buildingId },
    });

    const needMedia =
      fetchMediaAlways ||
      !existing ||
      idsChanged(existing.oruloImageIds, mapped.imageIds) ||
      idsChanged(existing.oruloFloorPlanIds, mapped.floorPlanIds);

    let images: StoredImage[] = [];
    if (needMedia) {
      const [rawImages, rawPlans] = await Promise.all([
        this.api.getImages(token, buildingId),
        this.api.getFloorPlans(token, buildingId),
      ]);
      images = [
        ...extractMediaUrls(rawImages),
        ...extractMediaUrls(rawPlans),
      ].slice(0, ORULO_MAX_IMAGES);
    } else if (existing) {
      const prev = Array.isArray(existing.imagens) ? existing.imagens : [];
      images = (prev as { url?: string }[])
        .filter((item) => typeof item?.url === 'string')
        .map((item) => ({ url: item.url as string, publicId: '' }));
    }

    const construtoraId = await this.resolveConstrutora(
      tenantId,
      mapped.developerName,
    );
    const localidadeId = await this.resolveLocalidade(tenantId, mapped.cidade);
    const tags = this.mergeTags(existing?.tags ?? [], [ORULO_TAG]);
    const stored = serializeStoredImages(images);

    const data = {
      nome: mapped.nome,
      cidade: mapped.cidade,
      endereco: mapped.endereco,
      tipo: mapped.tipo,
      status: mapped.status,
      previsaoEntrega: this.toDate(mapped.previsaoEntrega),
      quartos: mapped.quartos,
      banheiros: mapped.banheiros,
      vagas: mapped.vagas,
      valorReferencia: mapped.valorReferencia,
      areaM2: mapped.areaM2,
      observacao: mapped.observacao,
      externalUrl: mapped.externalUrl,
      construtoraId,
      localidadeId,
      tags,
      imagens: stored,
      imagemUrl: images[0]?.url ?? null,
      oruloBuildingId: buildingId,
      oruloImageIds: mapped.imageIds,
      oruloFloorPlanIds: mapped.floorPlanIds,
      oruloStatus: 'active',
      oruloSyncedAt: new Date(),
      ativo: true,
    };

    const saved = existing
      ? await this.prisma.empreendimento.update({
          where: { id: existing.id },
          data,
        })
      : await this.prisma.empreendimento.create({
          data: {
            tenantId,
            externalKey: oruloExternalKey(buildingId),
            ...data,
          },
        });

    await this.pushPublicationLinks(token, buildingId, saved.id, true);
    return saved;
  }

  async softRemove(tenantId: string, buildingId: number) {
    const existing = await this.prisma.empreendimento.findFirst({
      where: { tenantId, oruloBuildingId: buildingId },
    });
    if (!existing) return;
    await this.prisma.empreendimento.update({
      where: { id: existing.id },
      data: { ativo: false, oruloStatus: 'removed', oruloSyncedAt: new Date() },
    });
    try {
      const connection = await this.prisma.tenantOruloConnection.findUnique({
        where: { tenantId },
      });
      if (connection?.ativo) {
        const token = await this.ensureClientToken(connection);
        await this.pushPublicationLinks(token, buildingId, existing.id, false);
      }
    } catch (error) {
      this.logger.warn(
        `Não foi possível despublicar #${buildingId}: ${
          error instanceof Error ? error.message : error
        }`,
      );
    }
  }

  async hardRemove(tenantId: string, buildingId: number) {
    const existing = await this.prisma.empreendimento.findFirst({
      where: { tenantId, oruloBuildingId: buildingId },
      include: {
        _count: { select: { leads: true, documentacoes: true, propostas: true } },
      },
    });
    if (!existing) return;
    const linked =
      existing._count.leads +
      existing._count.documentacoes +
      existing._count.propostas;
    if (linked > 0) {
      await this.prisma.empreendimento.update({
        where: { id: existing.id },
        data: {
          ativo: false,
          oruloStatus: 'excluded',
          oruloSyncedAt: new Date(),
        },
      });
      return;
    }
    await this.prisma.empreendimento.delete({ where: { id: existing.id } });
  }

  private async pushPublicationLinks(
    token: string,
    buildingId: number,
    empreendimentoId: string,
    active: boolean,
  ) {
    const frontend = this.config.get<string>('FRONTEND_URL')?.replace(/\/$/, '');
    if (!frontend) return;
    await this.api.putPublicationLinks(token, buildingId, [
      { url: `${frontend}/imoveis/${empreendimentoId}`, active },
    ]);
  }

  private async collectActiveIds(token: string) {
    const ids: number[] = [];
    let page = 1;
    let totalPages = 1;
    do {
      const res = await this.api.listActiveIds(token, page);
      for (const row of res.building_ids ?? []) {
        if (Number.isFinite(row.id)) ids.push(row.id);
      }
      totalPages = res.total_pages ?? page;
      page += 1;
    } while (page <= totalPages);
    return ids;
  }

  private async collectRemovedIds(token: string, updatedAfter: string) {
    const ids: number[] = [];
    let page = 1;
    let totalPages = 1;
    do {
      const res = await this.api.listRemovedIds(token, updatedAfter, page);
      for (const row of res.building_ids ?? []) {
        if (Number.isFinite(row.id)) ids.push(row.id);
      }
      totalPages = res.total_pages ?? page;
      page += 1;
    } while (page <= totalPages);
    return ids;
  }

  private updatedAfter(last: Date | null) {
    const now = Date.now();
    const maxWindow = 89 * 24 * 60 * 60 * 1000;
    const from = last?.getTime() ?? now - 7 * 24 * 60 * 60 * 1000;
    const safe = new Date(Math.max(from, now - maxWindow));
    const dd = String(safe.getUTCDate()).padStart(2, '0');
    const mm = String(safe.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = safe.getUTCFullYear();
    const hh = String(safe.getUTCHours()).padStart(2, '0');
    const min = String(safe.getUTCMinutes()).padStart(2, '0');
    const ss = String(safe.getUTCSeconds()).padStart(2, '0');
    return `${dd}/${mm}/${yyyy} ${hh}:${min}:${ss}`;
  }

  private async connectionsForEvent(clientId?: string) {
    if (clientId) {
      const one = await this.prisma.tenantOruloConnection.findFirst({
        where: { clientId, ativo: true },
        select: { id: true, tenantId: true, clientId: true },
      });
      return one ? [one] : [];
    }
    return this.prisma.tenantOruloConnection.findMany({
      where: { ativo: true },
      select: { id: true, tenantId: true, clientId: true },
    });
  }

  private async reconcileDueConnections() {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const cutoff = new Date(Date.now() - ORULO_RECONCILE_MIN_MS);
      const due = await this.prisma.tenantOruloConnection.findMany({
        where: {
          ativo: true,
          syncing: false,
          OR: [{ lastReconcileAt: null }, { lastReconcileAt: { lt: cutoff } }],
        },
        select: { id: true },
      });
      for (const row of due) {
        await this.syncConnection(row.id, false);
      }
    } finally {
      this.ticking = false;
    }
  }

  async ensureClientToken(connection: {
    id: string;
    clientId: string;
    clientSecret: string;
    accessToken: string | null;
  }) {
    if (connection.accessToken) {
      return decryptOruloSecret(connection.accessToken, this.config);
    }
    return this.refreshClientToken(connection);
  }

  async refreshClientToken(connection: {
    id: string;
    clientId: string;
    clientSecret: string;
  }) {
    const secret = decryptOruloSecret(connection.clientSecret, this.config);
    const token = await this.api.clientCredentials(connection.clientId, secret);
    await this.prisma.tenantOruloConnection.update({
      where: { id: connection.id },
      data: { accessToken: encryptOruloSecret(token, this.config) },
    });
    return token;
  }

  private async requireConnection(id: string) {
    const connection = await this.prisma.tenantOruloConnection.findUnique({
      where: { id },
    });
    if (!connection) {
      throw new BadRequestException('Conexão Órulo não encontrada.');
    }
    return connection;
  }

  private async resolveConstrutora(tenantId: string, nome: string | null) {
    if (!nome) return null;
    const existing = await this.prisma.construtora.findFirst({
      where: { tenantId, nome: { equals: nome, mode: 'insensitive' } },
      select: { id: true },
    });
    if (existing) return existing.id;
    const created = await this.prisma.construtora.create({
      data: { tenantId, nome },
      select: { id: true },
    });
    return created.id;
  }

  private async resolveLocalidade(tenantId: string, nome: string | null) {
    if (!nome) return null;
    const existing = await this.prisma.localidade.findFirst({
      where: { tenantId, nome: { equals: nome, mode: 'insensitive' } },
      select: { id: true },
    });
    if (existing) return existing.id;
    const created = await this.prisma.localidade.create({
      data: { tenantId, nome },
      select: { id: true },
    });
    return created.id;
  }

  private mergeTags(current: string[], extra: string[]) {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const tag of [...current, ...extra]) {
      const label = tag.trim();
      if (!label) continue;
      const key = label.toLocaleLowerCase('pt-BR');
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(label);
    }
    return out;
  }

  private toDate(value: string | null): Date | null {
    if (!value) return null;
    const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
    return Number.isNaN(date.getTime()) ? null : date;
  }
}

export type OruloConnectionRow = Prisma.TenantOruloConnectionGetPayload<{
  select: {
    id: true;
    tenantId: true;
    clientId: true;
    ativo: true;
    lastFullSyncAt: true;
    lastReconcileAt: true;
    lastError: true;
    syncing: true;
    createdAt: true;
    updatedAt: true;
  };
}>;
