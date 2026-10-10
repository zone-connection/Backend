import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { requireTenantId } from '../common/utils/tenant';
import { OruloApiClient, OruloApiError } from './orulo-api.client';
import { OruloSyncService } from './orulo-sync.service';
import {
  decryptOruloSecret,
  encryptOruloSecret,
} from './orulo-token.crypto';
import { ORULO_API_BASE } from './orulo.constants';
import { oruloPublicOrigin } from './orulo-frontend-origin';
import {
  safeOruloReturnTo,
  signOruloOAuthState,
  verifyOruloOAuthState,
} from './orulo-oauth-state';
import { UpsertOruloConnectionDto } from './dto/upsert-orulo-connection.dto';

const connectionSelect = {
  id: true,
  tenantId: true,
  clientId: true,
  ativo: true,
  lastFullSyncAt: true,
  lastReconcileAt: true,
  lastError: true,
  syncing: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class OruloService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly api: OruloApiClient,
    private readonly sync: OruloSyncService,
  ) {}

  presentConnection(
    row: {
      clientId: string;
    } & Record<string, unknown>,
  ) {
    return {
      ...row,
      clientId: this.mask(row.clientId),
    };
  }

  async statusForTenant(tenantId: string) {
    const connection = await this.prisma.tenantOruloConnection.findUnique({
      where: { tenantId },
      select: connectionSelect,
    });
    const webhookBase =
      this.config.get<string>('BACKEND_PUBLIC_URL')?.replace(/\/$/, '') ||
      this.config.get<string>('API_PUBLIC_URL')?.replace(/\/$/, '') ||
      '';
    const buildingCount = await this.prisma.empreendimento.count({
      where: { tenantId, oruloBuildingId: { not: null } },
    });
    return {
      connected: Boolean(connection?.ativo),
      connection: connection ? this.presentConnection(connection) : null,
      webhookUrl: webhookBase ? `${webhookBase}/webhooks/orulo` : null,
      oauthRedirectUri: this.redirectUri(),
      buildingCount,
    };
  }

  async status(user: AuthenticatedUser) {
    const userToken = await this.prisma.userOruloToken.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    return {
      ...(await this.statusForTenant(requireTenantId(user))),
      endUserAuthorized: Boolean(userToken),
    };
  }

  async upsertForTenant(tenantId: string, dto: UpsertOruloConnectionDto) {
    const clientId = dto.clientId.trim();
    const clientSecret = encryptOruloSecret(dto.clientSecret.trim(), this.config);
    const existingByClient = await this.prisma.tenantOruloConnection.findUnique({
      where: { clientId },
    });
    if (existingByClient && existingByClient.tenantId !== tenantId) {
      throw new BadRequestException(
        'Este Client ID da Órulo já está vinculado a outro cliente.',
      );
    }

    let token: string;
    try {
      token = await this.api.clientCredentials(clientId, dto.clientSecret.trim());
      await this.api.getConfig(token);
    } catch {
      throw new BadRequestException(
        'Não foi possível autenticar na Órulo. Confira Client ID e Secret.',
      );
    }

    const data = {
      clientId,
      clientSecret,
      accessToken: encryptOruloSecret(token, this.config),
      ativo: dto.ativo ?? true,
      lastError: null,
    };

    const connection = await this.prisma.tenantOruloConnection.upsert({
      where: { tenantId },
      create: { tenantId, ...data },
      update: data,
      select: connectionSelect,
    });

    await this.sync.syncConnection(connection.id, true);
    return this.presentConnection(connection);
  }

  async upsert(user: AuthenticatedUser, dto: UpsertOruloConnectionDto) {
    return this.upsertForTenant(requireTenantId(user), dto);
  }

  async disconnectForTenant(tenantId: string) {
    const connection = await this.prisma.tenantOruloConnection.findUnique({
      where: { tenantId },
    });
    if (!connection) throw new NotFoundException('Órulo não está conectada.');
    await this.prisma.tenantOruloConnection.delete({ where: { id: connection.id } });
    return { ok: true };
  }

  async setAtivo(tenantId: string, ativo: boolean) {
    const connection = await this.prisma.tenantOruloConnection.findUnique({
      where: { tenantId },
      select: connectionSelect,
    });
    if (!connection) throw new NotFoundException('Órulo não está conectada.');
    const next = await this.prisma.tenantOruloConnection.update({
      where: { id: connection.id },
      data: { ativo },
      select: connectionSelect,
    });
    return this.presentConnection(next);
  }

  async syncNow(user: AuthenticatedUser) {
    const tenantId = requireTenantId(user);
    const connection = await this.prisma.tenantOruloConnection.findUnique({
      where: { tenantId },
    });
    if (!connection) throw new NotFoundException('Órulo não está conectada.');
    return this.sync.syncConnection(connection.id, true);
  }

  authorizeUrl(user: AuthenticatedUser, returnTo?: string) {
    const tenantId = requireTenantId(user);
    return this.prisma.tenantOruloConnection
      .findUnique({ where: { tenantId } })
      .then((connection) => {
        if (!connection?.ativo) {
          throw new BadRequestException(
            'Conecte as credenciais da imobiliária na Órulo antes de autorizar o corretor.',
          );
        }
        const redirect = this.redirectUri();
        const state = signOruloOAuthState(
          {
            uid: user.id,
            tid: tenantId,
            returnTo: safeOruloReturnTo(returnTo),
          },
          this.config,
        );
        const params = new URLSearchParams({
          client_id: connection.clientId,
          redirect_uri: redirect,
          response_type: 'code',
          state,
        });
        return {
          url: `${ORULO_API_BASE}/oauth/authorize?${params.toString()}`,
          redirectUri: redirect,
        };
      });
  }

  async completeEndUser(user: AuthenticatedUser, code: string, state?: string) {
    const tenantId = requireTenantId(user);
    if (state) {
      const parsed = verifyOruloOAuthState(state, this.config);
      if (!parsed || parsed.uid !== user.id || parsed.tid !== tenantId) {
        throw new BadRequestException(
          'A autorização da Órulo expirou ou não pertence a este usuário. Tente de novo.',
        );
      }
    }
    const connection = await this.prisma.tenantOruloConnection.findUnique({
      where: { tenantId },
    });
    if (!connection) throw new NotFoundException('Órulo não está conectada.');
    const secret = decryptOruloSecret(connection.clientSecret, this.config);
    try {
      const token = await this.api.authorizationCode({
        clientId: connection.clientId,
        clientSecret: secret,
        code: code.trim(),
        redirectUri: this.redirectUri(),
      });
      await this.prisma.userOruloToken.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          tenantId,
          accessToken: encryptOruloSecret(token, this.config),
        },
        update: { accessToken: encryptOruloSecret(token, this.config) },
      });
      const parsed = state
        ? verifyOruloOAuthState(state, this.config)
        : null;
      return {
        connected: true,
        returnTo: parsed?.returnTo ?? '/imoveis',
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('Não foi possível concluir a autorização Órulo.');
    }
  }

  async disconnectEndUser(user: AuthenticatedUser) {
    await this.prisma.userOruloToken.deleteMany({ where: { userId: user.id } });
    return { connected: false };
  }

  async comercial(user: AuthenticatedUser, empreendimentoId: string) {
    const tenantId = requireTenantId(user);
    const item = await this.prisma.empreendimento.findFirst({
      where: { id: empreendimentoId, tenantId },
      select: {
        id: true,
        oruloBuildingId: true,
        externalUrl: true,
        nome: true,
      },
    });
    if (!item) throw new NotFoundException('Empreendimento não encontrado.');
    if (!item.oruloBuildingId) {
      return { orulo: false, oruloUrl: item.externalUrl };
    }

    const userToken = await this.prisma.userOruloToken.findUnique({
      where: { userId: user.id },
    });
    if (!userToken) {
      return {
        orulo: true,
        authorized: false,
        oruloUrl: item.externalUrl,
        buildingId: item.oruloBuildingId,
      };
    }

    const token = decryptOruloSecret(userToken.accessToken, this.config);
    try {
      const building = await this.api.getBuilding(token, item.oruloBuildingId);
      const contacts = await this.hydrateContacts(
        token,
        item.oruloBuildingId,
        building,
      );
      const files = await this.hydrateFiles(token, item.oruloBuildingId, building);
      return {
        orulo: true,
        authorized: true,
        stored: false,
        oruloUrl:
          asLiveString(building.orulo_url) ??
          asLiveString(building.website) ??
          item.externalUrl,
        website: asLiveString(building.website),
        buildingId: item.oruloBuildingId,
        opportunity: asLiveRecord(building.opportunity),
        commissionPct: firstCommission(contacts),
        commercialContacts: contacts,
        files,
      };
    } catch (error) {
      if (error instanceof OruloApiError && error.status === 401) {
        await this.prisma.userOruloToken.delete({ where: { userId: user.id } });
        return {
          orulo: true,
          authorized: false,
          oruloUrl: item.externalUrl,
          buildingId: item.oruloBuildingId,
        };
      }
      throw error;
    }
  }

  private async hydrateContacts(
    token: string,
    buildingId: number,
    building: Record<string, unknown>,
  ) {
    const list = Array.isArray(building.commercial_contacts)
      ? building.commercial_contacts
      : [];
    const out: Record<string, unknown>[] = [];
    for (const item of list) {
      if (!item || typeof item !== 'object') continue;
      const rec = item as Record<string, unknown>;
      const id = rec.id != null ? String(rec.id) : '';
      if (!id) {
        out.push(rec);
        continue;
      }
      try {
        const detail = await this.api.getCommercialContact(token, buildingId, id);
        out.push({ ...rec, ...detail });
      } catch {
        out.push(rec);
      }
    }
    return out;
  }

  private async hydrateFiles(
    token: string,
    buildingId: number,
    building: Record<string, unknown>,
  ) {
    const list = Array.isArray(building.files) ? building.files : [];
    const out: Record<string, unknown>[] = [];
    for (const item of list) {
      if (!item || typeof item !== 'object') continue;
      const rec = item as Record<string, unknown>;
      const id = rec.id != null ? String(rec.id) : '';
      if (!id) {
        out.push(rec);
        continue;
      }
      try {
        const detail = await this.api.getFile(token, buildingId, id);
        out.push({ ...rec, ...detail });
      } catch {
        out.push(rec);
      }
    }
    return out;
  }

  private redirectUri() {
    const explicit = this.config.get<string>('ORULO_REDIRECT_URI')?.trim();
    if (explicit && !explicit.includes(',')) return explicit;
    const origin = oruloPublicOrigin(this.config.get<string>('FRONTEND_URL'));
    if (!origin) {
      throw new BadRequestException(
        'Defina FRONTEND_URL ou ORULO_REDIRECT_URI para o OAuth da Órulo.',
      );
    }
    return `${origin}/orulo-oauth-callback`;
  }

  private mask(value: string) {
    if (value.length <= 6) return '••••';
    return `${value.slice(0, 4)}…${value.slice(-4)}`;
  }
}

function asLiveString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function asLiveRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function firstCommission(contacts: Record<string, unknown>[]) {
  for (const contact of contacts) {
    const keys = [
      'real_estate_agency_commission',
      'realtor_commission',
      'commission',
      'commission_percentage',
    ];
    for (const key of keys) {
      const raw = contact[key];
      const num = typeof raw === 'number' ? raw : Number(raw);
      if (Number.isFinite(num)) return num;
    }
  }
  return null;
}
