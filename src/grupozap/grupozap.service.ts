import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, VendaUsadoStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { CatalogService } from '../catalog/catalog.service';
import { FunisService } from '../funis/funis.service';
import { LeadNotifyService } from '../lead-notify/lead-notify.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { requireTenantId } from '../common/utils/tenant';
import {
  DISPLAY_ADDRESS_VALUES,
  type DisplayAddress,
} from './grupozap.constants';
import {
  buildGrupoZapFeed,
  type FeedContact,
  type FeedImovel,
} from './grupozap-feed';
import {
  isValidEmail,
  leadRejectionReason,
  parseGrupoZapLead,
  type GrupoZapLead,
} from './grupozap-lead.parser';

type ReportIssue = {
  level: 'error' | 'warning';
  message: string;
  externalId: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

function decimalToNumber(value: Prisma.Decimal | number | null | undefined): number | null {
  if (value == null) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function extractReportIssues(payload: Record<string, unknown>): ReportIssue[] {
  const issues: ReportIssue[] = [];
  const push = (
    level: ReportIssue['level'],
    message: string,
    externalIds: unknown,
  ) => {
    if (!Array.isArray(externalIds)) return;
    for (const id of externalIds) {
      const externalId = text(id);
      if (!externalId || !message) continue;
      issues.push({ level, message, externalId });
    }
  };

  if (Array.isArray(payload.errors)) {
    for (const item of payload.errors) {
      const row = asRecord(item);
      if (!row) continue;
      push('error', text(row.errorMessage), row.externalIds);
    }
  }
  if (Array.isArray(payload.warnings)) {
    for (const item of payload.warnings) {
      const row = asRecord(item);
      if (!row) continue;
      push('warning', text(row.message), row.externalIds);
    }
  }
  return issues;
}

@Injectable()
export class GrupoZapService {
  private readonly logger = new Logger(GrupoZapService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly funis: FunisService,
    private readonly catalog: CatalogService,
    private readonly leadNotify: LeadNotifyService,
  ) {}

  private publicBase(): string {
    return (
      this.config.get<string>('BACKEND_PUBLIC_URL')?.replace(/\/$/, '') ||
      this.config.get<string>('API_PUBLIC_URL')?.replace(/\/$/, '') ||
      ''
    );
  }

  private urls(anuncianteId: string) {
    const base = this.publicBase();
    if (!base) {
      return { leadUrl: null, feedUrl: null, reportUrl: null };
    }
    return {
      leadUrl: `${base}/api/grupozap/lead/${anuncianteId}`,
      feedUrl: `${base}/api/feeds/grupozap/${anuncianteId}`,
      reportUrl: `${base}/api/grupozap/report`,
    };
  }

  async status(user: AuthenticatedUser) {
    const tenantId = requireTenantId(user);
    const connection = await this.prisma.tenantGrupoZapConnection.findUnique({
      where: { tenantId },
    });
    const secretConfigured = Boolean(
      this.config.get<string>('GRUPOZAP_SECRET_KEY')?.trim(),
    );
    const stock = connection?.ativo
      ? await this.loadStock(tenantId)
      : { included: 0, blocked: [] as { imovelId: string; titulo: string; reasons: string[] }[] };
    const issues = connection
      ? await this.prisma.grupoZapListingIssue.findMany({
          where: { tenantId },
          orderBy: { createdAt: 'desc' },
          take: 50,
          select: {
            imovelId: true,
            level: true,
            message: true,
            reportExternalId: true,
            createdAt: true,
          },
        })
      : [];

    return {
      connected: Boolean(connection?.ativo),
      secretConfigured,
      displayAddress: connection?.displayAddress ?? 'Neighborhood',
      anuncianteId: connection?.anuncianteId ?? null,
      ...(connection ? this.urls(connection.anuncianteId) : {
        leadUrl: null,
        feedUrl: null,
        reportUrl: this.publicBase()
          ? `${this.publicBase()}/api/grupozap/report`
          : null,
      }),
      publishableCount: stock.included,
      blocked: stock.blocked,
      issues,
    };
  }

  async connect(user: AuthenticatedUser) {
    const tenantId = requireTenantId(user);
    const existing = await this.prisma.tenantGrupoZapConnection.findUnique({
      where: { tenantId },
    });
    if (existing) {
      if (!existing.ativo) {
        await this.prisma.tenantGrupoZapConnection.update({
          where: { id: existing.id },
          data: { ativo: true },
        });
      }
      return this.status(user);
    }
    await this.prisma.tenantGrupoZapConnection.create({
      data: {
        tenantId,
        anuncianteId: randomUUID(),
        ativo: true,
      },
    });
    return this.status(user);
  }

  async disconnect(user: AuthenticatedUser) {
    const tenantId = requireTenantId(user);
    await this.prisma.tenantGrupoZapConnection.updateMany({
      where: { tenantId },
      data: { ativo: false },
    });
    return this.status(user);
  }

  async update(user: AuthenticatedUser, displayAddress: DisplayAddress) {
    if (!DISPLAY_ADDRESS_VALUES.includes(displayAddress)) {
      throw new BadRequestException('displayAddress inválido.');
    }
    const tenantId = requireTenantId(user);
    const connection = await this.prisma.tenantGrupoZapConnection.findUnique({
      where: { tenantId },
    });
    if (!connection?.ativo) {
      throw new NotFoundException('Conexão Grupo OLX não está ativa.');
    }
    await this.prisma.tenantGrupoZapConnection.update({
      where: { id: connection.id },
      data: { displayAddress },
    });
    return this.status(user);
  }

  async renderFeed(anuncianteId: string): Promise<string> {
    const connection = await this.prisma.tenantGrupoZapConnection.findUnique({
      where: { anuncianteId },
      include: {
        tenant: {
          select: {
            name: true,
            email: true,
            telefone: true,
            logoUrl: true,
          },
        },
      },
    });
    if (!connection?.ativo) {
      throw new NotFoundException('Feed Grupo OLX não encontrado.');
    }
    const stock = await this.loadStock(connection.tenantId, connection.displayAddress);
    return stock.xml;
  }

  async handleLead(anuncianteId: string | undefined, body: unknown) {
    const rejection = leadRejectionReason(body);
    if (rejection) {
      throw new BadRequestException(rejection);
    }
    const lead = parseGrupoZapLead(body);
    const existing = await this.prisma.grupoZapWebhookDelivery.findUnique({
      where: { originLeadId: lead.originLeadId },
      select: { id: true },
    });
    if (existing) {
      return { ok: true, duplicate: true };
    }

    const tenantId = await this.resolveTenant(anuncianteId, lead);
    if (!tenantId) {
      throw new BadRequestException(
        'Anunciante não encontrado para este lead.',
      );
    }

    try {
      const created = await this.persistLead(tenantId, lead, body);
      void this.leadNotify.notifyNewLead({
        tenantId,
        lead: {
          id: created.id,
          nome: created.nome,
          telefone: created.telefone,
          origem: created.origem,
          cidade: created.cidade,
          corretorId: null,
        },
      });
      this.logger.log(
        `Lead Grupo OLX originLeadId=${lead.originLeadId} crmLeadId=${created.id} tenantId=${tenantId}`,
      );
      return { ok: true, leadId: created.id };
    } catch (error) {
      if (isUniqueViolation(error)) {
        return { ok: true, duplicate: true };
      }
      throw error;
    }
  }

  async handleReport(body: unknown) {
    const record = asRecord(body);
    const externalId = text(record?.id);
    if (!record || !externalId) {
      throw new BadRequestException('Relatório sem id.');
    }
    const company = text(record.company);
    const issues = extractReportIssues(record);

    await this.prisma.grupoZapImportReport.upsert({
      where: { externalId },
      create: {
        externalId,
        company,
        payload: record as Prisma.InputJsonValue,
      },
      update: {
        company,
        payload: record as Prisma.InputJsonValue,
        receivedAt: new Date(),
      },
    });

    const listingIds = [...new Set(issues.map((issue) => issue.externalId))];
    const imoveis = listingIds.length
      ? await this.prisma.imovel.findMany({
          where: { id: { in: listingIds } },
          select: { id: true, tenantId: true },
        })
      : [];
    const tenantByImovel = new Map(imoveis.map((row) => [row.id, row.tenantId]));
    const tenantIds = [...new Set(imoveis.map((row) => row.tenantId))];

    if (tenantIds.length > 0) {
      const rows = issues.flatMap((issue) => {
        const tenantId = tenantByImovel.get(issue.externalId);
        if (!tenantId) return [];
        return [
          {
            tenantId,
            imovelId: issue.externalId,
            reportExternalId: externalId,
            level: issue.level,
            message: issue.message.slice(0, 500),
          },
        ];
      });
      await this.prisma.$transaction([
        this.prisma.grupoZapListingIssue.deleteMany({
          where: { tenantId: { in: tenantIds } },
        }),
        ...(rows.length
          ? [this.prisma.grupoZapListingIssue.createMany({ data: rows })]
          : []),
      ]);
    }

    return { ok: true };
  }

  private async resolveTenant(
    anuncianteId: string | undefined,
    lead: GrupoZapLead,
  ): Promise<string | null> {
    if (anuncianteId) {
      const connection = await this.prisma.tenantGrupoZapConnection.findUnique({
        where: { anuncianteId },
        select: { tenantId: true, ativo: true },
      });
      return connection?.ativo ? connection.tenantId : null;
    }

    const document = lead.mcmv?.sellerDocument;
    if (document) {
      const tenants = await this.prisma.tenant.findMany({
        where: { documento: { not: '' } },
        select: { id: true, documento: true },
      });
      const match = tenants.find(
        (tenant) => tenant.documento.replace(/\D/g, '') === document,
      );
      if (match) {
        const connection = await this.prisma.tenantGrupoZapConnection.findUnique({
          where: { tenantId: match.id },
          select: { ativo: true },
        });
        if (connection?.ativo) return match.id;
      }
    }

    if (lead.clientListingId) {
      const imovel = await this.prisma.imovel.findUnique({
        where: { id: lead.clientListingId },
        select: { tenantId: true },
      });
      if (imovel) {
        const connection = await this.prisma.tenantGrupoZapConnection.findUnique({
          where: { tenantId: imovel.tenantId },
          select: { ativo: true },
        });
        if (connection?.ativo) return imovel.tenantId;
      }
    }

    return null;
  }

  private async persistLead(
    tenantId: string,
    lead: GrupoZapLead,
    body: unknown,
  ) {
    const origemLabel = lead.isMcmv ? 'MCMV OLX' : 'Grupo OLX';
    const origemByLabel = await this.catalog.ensureOrigensForImport(tenantId, [
      origemLabel,
    ]);
    const placement = await this.funis.comercialPlacement(tenantId);
    const imovel = lead.clientListingId
      ? await this.prisma.imovel.findFirst({
          where: { id: lead.clientListingId, tenantId },
          select: {
            id: true,
            cidade: true,
            bairro: true,
            vendaUsado: { select: { id: true } },
          },
        })
      : null;

    const email = isValidEmail(lead.email)
      ? lead.email
      : `${lead.originLeadId}@grupoolx.lead.local`;
    const cidade = imovel?.cidade || lead.mcmv?.city || 'A definir';
    const bairro = imovel?.bairro || 'A definir';
    const tags = [
      'Grupo OLX',
      ...(lead.leadTypeLabel ? [lead.leadTypeLabel] : []),
      ...(lead.leadCerto ? ['LeadCerto'] : []),
      ...(lead.izi ? ['IZI'] : []),
      ...(lead.isMcmv ? ['MCMV'] : []),
    ];
    const orcamento =
      lead.mcmv?.propertyValue != null &&
      Number.isInteger(lead.mcmv.propertyValue) &&
      lead.mcmv.propertyValue > 0 &&
      lead.mcmv.propertyValue <= 2_000_000_000
        ? lead.mcmv.propertyValue
        : null;

    return this.prisma.$transaction(async (tx) => {
      await tx.grupoZapWebhookDelivery.create({
        data: {
          originLeadId: lead.originLeadId,
          tenantId,
          payload: (asRecord(body) ?? {}) as Prisma.InputJsonValue,
        },
      });

      const created = await tx.lead.create({
        data: {
          tenantId,
          nome: lead.name.slice(0, 200),
          telefone: lead.phone,
          email,
          origem: origemByLabel.get(origemLabel) ?? origemLabel,
          interesse: lead.interesse,
          cidade: cidade.slice(0, 120) || 'A definir',
          bairro: bairro.slice(0, 120) || 'A definir',
          stage: placement.stage,
          funilId: placement.funilId,
          prioridade: lead.prioridade,
          orcamentoMax: orcamento,
          tags,
        },
        select: { id: true, nome: true, telefone: true, origem: true, cidade: true },
      });

      await tx.leadGrupoZapLink.create({
        data: {
          leadId: created.id,
          originLeadId: lead.originLeadId,
          originListingId: lead.originListingId,
          clientListingId: lead.clientListingId,
          leadOrigin: lead.leadOrigin,
          leadType: lead.leadType,
          transactionType: lead.transactionType,
          temperature: lead.temperature,
          message: lead.message.slice(0, 8000),
          leadCerto: lead.leadCerto,
          imovelId: imovel?.id ?? null,
        },
      });

      if (imovel?.vendaUsado) {
        await this.linkInteressado(tx, tenantId, imovel.vendaUsado.id, lead);
      }

      return created;
    });
  }

  private async linkInteressado(
    tx: Prisma.TransactionClient,
    tenantId: string,
    vendaUsadoId: string,
    lead: GrupoZapLead,
  ) {
    const placeholder = lead.phone === '(00) 00000-0000';
    const email = isValidEmail(lead.email) ? lead.email : '';
    const filters = [
      ...(!placeholder ? [{ telefone: lead.phone }] : []),
      ...(email ? [{ email }] : []),
    ];
    const existing = filters.length
      ? await tx.interessadoUsado.findFirst({
          where: { tenantId, OR: filters },
          select: { id: true, observacoes: true },
        })
      : null;

    const note = lead.message.slice(0, 4000);
    const interessadoId = existing
      ? existing.id
      : (
          await tx.interessadoUsado.create({
            data: {
              tenantId,
              nome: lead.name.slice(0, 200),
              telefone: placeholder ? '' : lead.phone,
              email,
              observacoes: note,
              cidade: lead.mcmv?.city ?? '',
            },
            select: { id: true },
          })
        ).id;

    if (existing && note && !existing.observacoes.trim()) {
      await tx.interessadoUsado.update({
        where: { id: existing.id },
        data: { observacoes: note },
      });
    }

    await tx.vendaUsadoVinculo.upsert({
      where: {
        vendaUsadoId_interessadoId: {
          vendaUsadoId,
          interessadoId,
        },
      },
      create: {
        tenantId,
        vendaUsadoId,
        interessadoId,
        observacoes: note,
      },
      update: {},
    });
  }

  private async loadStock(tenantId: string, displayAddress?: string) {
    const [tenant, connection, imoveis] = await Promise.all([
      this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true, email: true, telefone: true, logoUrl: true },
      }),
      displayAddress
        ? Promise.resolve(null)
        : this.prisma.tenantGrupoZapConnection.findUnique({
            where: { tenantId },
            select: { displayAddress: true },
          }),
      this.prisma.imovel.findMany({
        where: {
          tenantId,
          vendaUsado: { is: { status: VendaUsadoStatus.disponivel } },
        },
        include: {
          fotos: { orderBy: { sortOrder: 'asc' } },
          vendaUsado: { select: { precoVenda: true } },
        },
      }),
    ]);

    const contact: FeedContact = {
      name: tenant?.name ?? '',
      email: tenant?.email ?? '',
      telephone: tenant?.telefone ?? '',
      logoUrl: tenant?.logoUrl ?? '',
    };
    const rawAddress = displayAddress || connection?.displayAddress || 'Neighborhood';
    const address = DISPLAY_ADDRESS_VALUES.includes(rawAddress as DisplayAddress)
      ? (rawAddress as DisplayAddress)
      : 'Neighborhood';
    const feedImoveis: FeedImovel[] = imoveis.map((imovel) => ({
      id: imovel.id,
      tipo: imovel.tipo,
      cep: imovel.cep,
      logradouro: imovel.logradouro,
      numero: imovel.numero,
      complemento: imovel.complemento,
      bairro: imovel.bairro,
      cidade: imovel.cidade,
      estado: imovel.estado,
      area: decimalToNumber(imovel.area),
      areaConstruida: decimalToNumber(imovel.areaConstruida),
      quartos: imovel.quartos,
      suites: imovel.suites,
      banheiros: imovel.banheiros,
      vagas: imovel.vagas,
      descricao: imovel.descricao,
      precoVenda: decimalToNumber(imovel.vendaUsado?.precoVenda),
      fotos: [
        ...imovel.fotos.map((foto) => foto.url),
        ...(imovel.fotoUrl ? [imovel.fotoUrl] : []),
      ],
    }));

    const built = buildGrupoZapFeed({
      providerEmail:
        this.config.get<string>('GRUPOZAP_PROVIDER_EMAIL')?.trim() ||
        contact.email,
      contact,
      displayAddress: address,
      imoveis: feedImoveis,
    });
    return built;
  }
}
