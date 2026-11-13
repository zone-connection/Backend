import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiAplicacaoStatus, ApiAutorizacaoStatus, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { SALT_ROUNDS } from '../config/security.constants';
import { PrismaService } from '../prisma/prisma.service';
import { ApiOauthLimiteService } from './api-oauth-limite.service';
import { isApiScope } from './api-scopes';
import {
  API_TOKEN_ISS_DEFAULT,
  signApiToken,
  verifyApiToken,
  type ApiAccessClaims,
} from './api-token';

const DUMMY_HASH = bcrypt.hashSync('api-credential-placeholder', SALT_ROUNDS);

export type TokenErrorCode =
  | 'invalid_client'
  | 'application_inactive'
  | 'authorization_revoked'
  | 'tenant_not_authorized'
  | 'tenant_inactive'
  | 'unsupported_grant';

@Injectable()
export class ApiOauthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly limite: ApiOauthLimiteService,
  ) {}

  issuer(): string {
    return this.config.get<string>('API_JWT_ISSUER')?.trim() || API_TOKEN_ISS_DEFAULT;
  }

  secret(): string {
    const secret = this.config.get<string>('API_JWT_SECRET')?.trim() ?? '';
    if (secret.length < 32) {
      throw new ServiceUnavailableException(
        'API v1 desligada: defina API_JWT_SECRET com ao menos 32 caracteres.',
      );
    }
    return secret;
  }

  ttl(): number {
    const raw = Number(this.config.get<string>('API_JWT_TTL_SECONDS') ?? 3600);
    if (!Number.isFinite(raw) || raw < 60 || raw > 86_400) return 3600;
    return Math.floor(raw);
  }

  async issue(
    body: {
      grant_type?: string;
      client_id?: string;
      client_secret?: string;
      tenant_slug?: string;
    },
    ip = 'desconhecido',
  ): Promise<{ access_token: string; token_type: 'Bearer'; expires_in: number }> {
    await this.limite.assertLivre(ip, body.client_id ?? '');
    try {
      const issued = await this.issueUnlocked(body);
      await this.limite.zerar(ip, body.client_id ?? '');
      return issued;
    } catch (err) {
      if (!(err instanceof HttpException) || err.getStatus() !== 429) {
        await this.limite.registrarFalha(ip, body.client_id ?? '');
      }
      throw err;
    }
  }

  private async issueUnlocked(body: {
    grant_type?: string;
    client_id?: string;
    client_secret?: string;
    tenant_slug?: string;
  }): Promise<{ access_token: string; token_type: 'Bearer'; expires_in: number }> {
    if (body.grant_type !== 'client_credentials') {
      throw this.fail(400, 'unsupported_grant');
    }
    const clientId = body.client_id?.trim() ?? '';
    const clientSecret = body.client_secret ?? '';
    const slug = body.tenant_slug?.trim() ?? '';
    if (!clientId || !clientSecret || !slug) {
      throw this.fail(401, 'invalid_client');
    }

    const app = await this.prisma.apiAplicacao.findUnique({
      where: { clientId },
      select: {
        id: true,
        status: true,
        segredoHash: true,
        credencialVersao: true,
        autorizacoes: {
          where: { tenant: { slug } },
          select: {
            status: true,
            scopes: true,
            tenantId: true,
            tenant: { select: { status: true } },
          },
          take: 1,
        },
      },
    });

    const hash = app?.segredoHash ?? DUMMY_HASH;
    const secretOk = await bcrypt.compare(clientSecret, hash);
    if (!app || !secretOk) {
      throw this.fail(401, 'invalid_client');
    }
    if (app.status !== ApiAplicacaoStatus.ativa) {
      throw this.fail(403, 'application_inactive');
    }
    const grant = app.autorizacoes[0];
    if (!grant) throw this.fail(403, 'tenant_not_authorized');
    if (grant.status !== ApiAutorizacaoStatus.ativa) {
      throw this.fail(403, 'authorization_revoked');
    }
    if (grant.tenant.status !== UserStatus.ativo) {
      throw this.fail(403, 'tenant_inactive');
    }

    const scopes = grant.scopes.filter(isApiScope);
    const access_token = signApiToken({
      secret: this.secret(),
      issuer: this.issuer(),
      clientId,
      appId: app.id,
      tenantId: grant.tenantId,
      scopes,
      versao: app.credencialVersao,
      ttlSeconds: this.ttl(),
    });
    return { access_token, token_type: 'Bearer', expires_in: this.ttl() };
  }

  /** Confere assinatura e se a autorização ainda vale para o tenant do token. */
  async authenticate(token: string): Promise<ApiAccessClaims> {
    let claims: ApiAccessClaims;
    try {
      claims = verifyApiToken({
        token,
        secret: this.secret(),
        issuer: this.issuer(),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'token inválido';
      throw new UnauthorizedException(message);
    }
    const grant = await this.prisma.apiAutorizacao.findUnique({
      where: {
        aplicacaoId_tenantId: {
          aplicacaoId: claims.appId,
          tenantId: claims.tenantId,
        },
      },
      select: {
        status: true,
        scopes: true,
        tenant: { select: { status: true } },
        aplicacao: { select: { status: true, clientId: true, credencialVersao: true } },
      },
    });
    if (
      !grant ||
      grant.aplicacao.status !== ApiAplicacaoStatus.ativa ||
      grant.aplicacao.clientId !== claims.sub ||
      grant.aplicacao.credencialVersao !== claims.ver
    ) {
      throw new UnauthorizedException('token inválido');
    }
    if (grant.tenant.status !== UserStatus.ativo) {
      throw new UnauthorizedException('imobiliária inativa');
    }
    if (grant.status !== ApiAutorizacaoStatus.ativa) {
      throw new UnauthorizedException('autorização revogada');
    }
    const live = new Set(grant.scopes);
    claims.scopes = claims.scopes.filter((scope) => live.has(scope) && isApiScope(scope));
    return claims;
  }

  private fail(status: 400 | 401 | 403, error: TokenErrorCode): never {
    if (status === 400) {
      throw new BadRequestException({ error, error_description: 'grant_type inválido.' });
    }
    if (status === 403) {
      throw new ForbiddenException({ error });
    }
    throw new UnauthorizedException({ error });
  }
}
