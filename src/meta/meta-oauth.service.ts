import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import type { Request } from 'express';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { PrismaService } from '../prisma/prisma.service';
import { MetaGraphApiService } from './meta-graph-api.service';
import {
  decryptPageAccessToken,
  encryptSecret,
  metaTokenKey,
} from './meta-token.crypto';
import {
  frontendMetaOAuthReturnUrl,
  metaOAuthConfigured,
  parseMetaAllowedRedirectUris,
  pickMetaRedirectUri,
  resolveMetaAppId,
} from './meta-oauth.util';
import { requireTenantId } from '../common/utils/tenant';

const SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_metadata',
  'pages_manage_ads',
  'leads_retrieval',
  'ads_read',
].join(',');

const STATE_TYP = 'meta-oauth';
const PENDING_TTL_MS = 15 * 60 * 1000;

type OAuthState = {
  sub: string;
  tenantId: string;
  redirectUri: string;
  typ: string;
};

type PendingSession = {
  userAccessToken: string;
  tenantId: string;
  userId: string;
  expiresAt: number;
};

@Injectable()
export class MetaOAuthService {
  private readonly logger = new Logger(MetaOAuthService.name);
  private readonly pending = new Map<string, PendingSession>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly graphApi: MetaGraphApiService,
  ) {}

  isConfigured() {
    return metaOAuthConfigured(this.config);
  }

  async status(user: AuthenticatedUser) {
    if (!this.isConfigured()) {
      return {
        configured: false,
        connected: false,
        pageName: null as string | null,
        pageId: null as string | null,
        adAccountName: null as string | null,
      };
    }
    const tenantId = requireTenantId(user);
    const row = await this.prisma.tenantMetaConnection.findFirst({
      where: { tenantId, ativo: true },
      orderBy: { updatedAt: 'desc' },
      select: {
        pageId: true,
        pageName: true,
        adAccountName: true,
      },
    });
    return {
      configured: true,
      connected: Boolean(row),
      pageName: row?.pageName ?? null,
      pageId: row?.pageId ?? null,
      adAccountName: row?.adAccountName ?? null,
    };
  }

  buildAuthorizeUrl(
    user: AuthenticatedUser,
    req: Request,
    returnOrigin?: string,
  ) {
    this.assertConfigured();
    this.assertCanManage(user);
    const tenantId = requireTenantId(user);
    const allowed = parseMetaAllowedRedirectUris(this.config);
    const redirectUri = pickMetaRedirectUri(req, allowed, returnOrigin);
    const state = this.jwt.sign(
      {
        sub: user.id,
        tenantId,
        redirectUri,
        typ: STATE_TYP,
      } satisfies OAuthState,
      {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
        expiresIn: '10m',
      },
    );
    const version =
      this.config.get<string>('META_GRAPH_API_VERSION') ?? 'v22.0';
    const params = new URLSearchParams({
      client_id: this.appId(),
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: SCOPES,
      state,
    });
    return `https://www.facebook.com/${version}/dialog/oauth?${params.toString()}`;
  }

  async handleCallback(query: {
    code?: string;
    state?: string;
    error?: string;
  }): Promise<string> {
    let redirectUri = parseMetaAllowedRedirectUris(this.config)[0];
    try {
      if (!query.state) {
        return frontendMetaOAuthReturnUrl(redirectUri ?? 'http://localhost', 'error');
      }
      const payload = this.jwt.verify<OAuthState>(query.state, {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      });
      if (
        payload.typ !== STATE_TYP ||
        !payload.sub ||
        !payload.tenantId ||
        !payload.redirectUri
      ) {
        return frontendMetaOAuthReturnUrl(redirectUri ?? payload.redirectUri, 'error');
      }
      redirectUri = payload.redirectUri;
      if (query.error === 'access_denied') {
        return frontendMetaOAuthReturnUrl(redirectUri, 'denied');
      }
      if (!query.code) {
        return frontendMetaOAuthReturnUrl(redirectUri, 'error');
      }

      const shortLived = await this.graphApi.exchangeCodeForUserToken(
        query.code,
        payload.redirectUri,
      );
      const longLived = await this.graphApi
        .exchangeLongLivedUserToken(shortLived.accessToken)
        .catch((err) => {
          this.logger.warn(
            `Token longo Meta falhou, usando token curto: ${err instanceof Error ? err.message : err}`,
          );
          return shortLived;
        });

      this.pending.set(this.pendingKey(payload.tenantId, payload.sub), {
        userAccessToken: longLived.accessToken,
        tenantId: payload.tenantId,
        userId: payload.sub,
        expiresAt: Date.now() + PENDING_TTL_MS,
      });
      return frontendMetaOAuthReturnUrl(redirectUri, 'select');
    } catch (err) {
      this.logger.warn(
        `OAuth Meta callback falhou: ${err instanceof Error ? err.message : err}`,
      );
      return frontendMetaOAuthReturnUrl(
        redirectUri ?? 'http://localhost:8080/api/integrations/meta/callback',
        'error',
      );
    }
  }

  async listAssets(user: AuthenticatedUser) {
    this.assertConfigured();
    this.assertCanManage(user);
    const tenantId = requireTenantId(user);
    const session = this.requirePending(tenantId, user.id);
    const [pages, adAccounts] = await Promise.all([
      this.graphApi.listUserPages(session.userAccessToken),
      this.graphApi.listAdAccounts(session.userAccessToken).catch((err) => {
        this.logger.warn(
          `Listar ad accounts falhou: ${err instanceof Error ? err.message : err}`,
        );
        return [];
      }),
    ]);
    return {
      pages: pages.map((page) => ({ id: page.id, name: page.name })),
      adAccounts,
    };
  }

  async complete(
    user: AuthenticatedUser,
    dto: { pageId: string; adAccountId?: string },
  ) {
    this.assertConfigured();
    this.assertCanManage(user);
    const tenantId = requireTenantId(user);
    const session = this.requirePending(tenantId, user.id);
    const pageId = dto.pageId.trim();
    const pages = await this.graphApi.listUserPages(session.userAccessToken);
    const page = pages.find((item) => item.id === pageId);
    if (!page) {
      throw new BadRequestException(
        'Esta Página não está entre as que você autorizou no Facebook.',
      );
    }

    const taken = await this.prisma.tenantMetaConnection.findUnique({
      where: { pageId },
      select: { tenantId: true, id: true },
    });
    if (taken && taken.tenantId !== tenantId) {
      throw new ConflictException(
        'Esta Página do Facebook já está conectada em outra imobiliária.',
      );
    }

    let adAccountName: string | null = null;
    const adAccountId = dto.adAccountId?.trim() || null;
    if (adAccountId) {
      const accounts = await this.graphApi
        .listAdAccounts(session.userAccessToken)
        .catch((): Array<{ id: string; name: string }> => []);
      const account = accounts.find((item) => item.id === adAccountId);
      adAccountName = account?.name ?? adAccountId;
    }

    try {
      await this.graphApi.subscribePageLeadgen(page.id, page.access_token);
    } catch (err) {
      this.logger.warn(
        `Inscrição leadgen falhou page_id=${page.id}: ${err instanceof Error ? err.message : err}`,
      );
    }

    const key = metaTokenKey(this.config);
    const pageAccessToken = encryptSecret(page.access_token, key);
    const existing = taken
      ? { id: taken.id }
      : await this.prisma.tenantMetaConnection.findFirst({
          where: { tenantId },
          select: { id: true },
        });

    if (existing) {
      await this.prisma.tenantMetaConnection.update({
        where: { id: existing.id },
        data: {
          pageId: page.id,
          pageAccessToken,
          pageName: page.name,
          adAccountId,
          adAccountName,
          connectedByUserId: user.id,
          ativo: true,
        },
      });
    } else {
      await this.prisma.tenantMetaConnection.create({
        data: {
          tenantId,
          pageId: page.id,
          pageAccessToken,
          pageName: page.name,
          adAccountId,
          adAccountName,
          connectedByUserId: user.id,
          ativo: true,
        },
      });
    }

    this.pending.delete(this.pendingKey(tenantId, user.id));
    return this.status(user);
  }

  async disconnect(user: AuthenticatedUser) {
    this.assertCanManage(user);
    const tenantId = requireTenantId(user);
    const rows = await this.prisma.tenantMetaConnection.findMany({
      where: { tenantId },
    });
    const key = metaTokenKey(this.config);
    for (const row of rows) {
      const token = decryptPageAccessToken(row.pageAccessToken, key);
      await this.graphApi.unsubscribePageApp(row.pageId, token);
    }
    await this.prisma.tenantMetaConnection.deleteMany({ where: { tenantId } });
    this.pending.delete(this.pendingKey(tenantId, user.id));
    return { ok: true };
  }

  private requirePending(tenantId: string, userId: string): PendingSession {
    const key = this.pendingKey(tenantId, userId);
    const session = this.pending.get(key);
    if (!session || session.expiresAt < Date.now()) {
      this.pending.delete(key);
      throw new BadRequestException(
        'A autorização do Facebook expirou. Clique em Conectar Facebook de novo.',
      );
    }
    return session;
  }

  private pendingKey(tenantId: string, userId: string) {
    return `${tenantId}:${userId}`;
  }

  private assertCanManage(user: AuthenticatedUser) {
    if (
      user.role !== Role.admin &&
      user.role !== Role.gerente &&
      user.role !== Role.super_admin
    ) {
      throw new ForbiddenException(
        'Apenas admin, gerente ou super admin pode conectar o Facebook.',
      );
    }
  }

  private assertConfigured() {
    if (!this.isConfigured()) {
      const hasSecret = Boolean(
        this.config.get<string>('META_APP_SECRET')?.trim(),
      );
      throw new ServiceUnavailableException(
        hasSecret
          ? 'A integração Facebook não está disponível neste ambiente.'
          : 'A API deste ambiente não tem META_APP_SECRET. No Dokploy da API de produção, cole a chave do app Meta (Configurações do app → Segredo do aplicativo) e faça redeploy.',
      );
    }
  }

  private appId() {
    return resolveMetaAppId(this.config);
  }
}
