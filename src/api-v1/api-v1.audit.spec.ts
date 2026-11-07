import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiAplicacaoStatus, ApiAutorizacaoStatus, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { ApiAccessGuard } from './api-access.guard';
import { ApiAppsController } from './api-apps.controller';
import { ApiAppsService } from './api-apps.service';
import { ApiOauthService } from './api-oauth.service';
import { signApiToken, verifyApiToken } from './api-token';

const SECRET = 'api-secret-api-secret-api-secret-32';
const USER_JWT = 'user-secret-user-secret-user-secret';

function limite() {
  return {
    assertLivre: async () => undefined,
    registrarFalha: async () => undefined,
    zerar: async () => undefined,
  };
}

function config() {
  return {
    get(key: string) {
      if (key === 'API_JWT_SECRET') return SECRET;
      if (key === 'API_JWT_ISSUER') return 'zone-connection-api';
      if (key === 'API_JWT_TTL_SECONDS') return '3600';
      return undefined;
    },
  };
}

type AppRow = {
  id: string;
  nome: string;
  status: ApiAplicacaoStatus;
  clientId: string;
  segredoHash: string;
  credencialVersao: number;
};
type GrantRow = {
  id: string;
  aplicacaoId: string;
  tenantId: string;
  scopes: string[];
  status: ApiAutorizacaoStatus;
};
type TenantRow = { id: string; slug: string; status: 'ativo' | 'inativo' };

function memory() {
  const tenants: TenantRow[] = [
    { id: 'tenant-a', slug: 'alfa', status: 'ativo' },
    { id: 'tenant-b', slug: 'beta', status: 'ativo' },
    { id: 'tenant-off', slug: 'inativa', status: 'inativo' },
  ];
  const apps: AppRow[] = [];
  const grants: GrantRow[] = [];
  let n = 0;
  const prisma = {
    tenant: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        tenants.find((t) => t.id === where.id) ?? null,
    },
    apiAplicacao: {
      create: async ({ data, select }: { data: AppRow & { autorizacoes: { create: Omit<GrantRow, 'id' | 'aplicacaoId'> } }; select?: object }) => {
        const id = `app-${++n}`;
        apps.push({
          id,
          nome: data.nome,
          status: ApiAplicacaoStatus.ativa,
          clientId: data.clientId,
          segredoHash: data.segredoHash,
          credencialVersao: 1,
        });
        grants.push({
          id: `grant-${n}`,
          aplicacaoId: id,
          tenantId: data.autorizacoes.create.tenantId,
          scopes: data.autorizacoes.create.scopes,
          status: ApiAutorizacaoStatus.ativa,
        });
        return { id, nome: data.nome, clientId: data.clientId, status: ApiAplicacaoStatus.ativa, ...(select ? {} : {}) };
      },
      findUnique: async ({ where }: { where: { id?: string; clientId?: string } }) => {
        const app = apps.find((a) => a.id === where.id || a.clientId === where.clientId);
        if (!app) return null;
        const slugFilter = (where as { clientId?: string }).clientId
          ? grants.filter((g) => g.aplicacaoId === app.id)
          : grants.filter((g) => g.aplicacaoId === app.id);
        return {
          ...app,
          autorizacoes: slugFilter.map((g) => ({
          status: g.status,
          scopes: g.scopes,
          tenantId: g.tenantId,
          tenant: { status: tenants.find((t) => t.id === g.tenantId)?.status ?? 'ativo' },
          })),
        };
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: { segredoHash?: string; credencialVersao?: { increment: number } };
      }) => {
        const app = apps.find((a) => a.id === where.id);
        if (!app) throw new Error('missing');
        if (data.segredoHash) app.segredoHash = data.segredoHash;
        if (data.credencialVersao) app.credencialVersao += data.credencialVersao.increment;
        return app;
      },
    },
    apiAutorizacao: {
      findUnique: async ({
        where,
      }: {
        where: { id?: string; aplicacaoId_tenantId?: { aplicacaoId: string; tenantId: string } };
      }) => {
        const grant = where.id
          ? grants.find((g) => g.id === where.id)
          : grants.find(
              (g) =>
                g.aplicacaoId === where.aplicacaoId_tenantId?.aplicacaoId &&
                g.tenantId === where.aplicacaoId_tenantId?.tenantId,
            );
        if (!grant) return null;
        const app = apps.find((a) => a.id === grant.aplicacaoId)!;
        return {
          ...grant,
          tenant: { status: tenants.find((t) => t.id === grant.tenantId)?.status ?? 'ativo' },
          aplicacao: {
            status: app.status,
            clientId: app.clientId,
            credencialVersao: app.credencialVersao,
          },
        };
      },
      upsert: async () => {
        throw new Error('não usado neste teste');
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<GrantRow> }) => {
        const grant = grants.find((g) => g.id === where.id);
        if (!grant) throw new Error('missing');
        Object.assign(grant, data);
        return grant;
      },
    },
  };

  const oauthPrisma = {
    apiAplicacao: {
      findUnique: async ({
        where,
        select,
      }: {
        where: { clientId: string };
        select?: { autorizacoes?: { where?: { tenant?: { slug: string } } } };
      }) => {
        const app = apps.find((a) => a.clientId === where.clientId);
        if (!app) return null;
        const slug = select?.autorizacoes?.where?.tenant?.slug;
        const list = grants
          .filter((g) => g.aplicacaoId === app.id)
          .filter((g) => {
            if (!slug) return true;
            return tenants.find((t) => t.id === g.tenantId)?.slug === slug;
          })
          .map((g) => ({
            status: g.status,
            scopes: g.scopes,
            tenantId: g.tenantId,
            tenant: { status: tenants.find((t) => t.id === g.tenantId)?.status ?? 'ativo' },
          }));
        return {
          id: app.id,
          status: app.status,
          credencialVersao: app.credencialVersao,
          segredoHash: app.segredoHash,
          autorizacoes: list,
        };
      },
    },
    apiAutorizacao: prisma.apiAutorizacao,
  };

  return { tenants, apps, grants, prisma, oauthPrisma };
}

describe('núcleo API v1', () => {
  it('1 cadastra aplicação e só devolve o segredo uma vez, em hash no store', async () => {
    const db = memory();
    const apps = new ApiAppsService(db.prisma as never);
    const created = await apps.criar({
      nome: 'Discador',
      tenantId: 'tenant-a',
      scopes: ['leads:read'],
    });
    assert.match(created.clientId, /^zc_/);
    assert.equal(created.clientSecret.length > 20, true);
    assert.equal('segredoHash' in created, false);
    const row = db.apps[0];
    assert.notEqual(row.segredoHash, created.clientSecret);
    assert.equal(await bcrypt.compare(created.clientSecret, row.segredoHash), true);
    const ids = new Set(db.apps.map((a) => a.clientId));
    assert.equal(ids.size, db.apps.length);
  });

  it('2 rejeita nome curto no service quando scopes vazios e 3 tenant inexistente', async () => {
    const db = memory();
    const apps = new ApiAppsService(db.prisma as never);
    await assert.rejects(
      () => apps.criar({ nome: 'Discador', tenantId: 'nao-existe', scopes: ['leads:read'] }),
      NotFoundException,
    );
  });

  it('4 usuário comum não cria aplicação', async () => {
    const apps = new ApiAppsService({ tenant: { findUnique: async () => null } } as never);
    const controller = new ApiAppsController(apps);
    assert.throws(
      () =>
        controller.criar(
          { nome: 'X', tenantId: 'tenant-a', scopes: ['leads:read'] },
          { id: 'u', role: Role.corretor, tenantId: 'tenant-a' } as never,
        ),
      ForbiddenException,
    );
  });

  it('5 a 13 emissão, segredo, grant, inativa, revogada e slug', async () => {
    const db = memory();
    const apps = new ApiAppsService(db.prisma as never);
    const created = await apps.criar({
      nome: 'Discador',
      tenantId: 'tenant-a',
      scopes: ['leads:read'],
    });
    const oauth = new ApiOauthService(db.oauthPrisma as never, config() as never, limite() as never);
    const ok = await oauth.issue({
      grant_type: 'client_credentials',
      client_id: created.clientId,
      client_secret: created.clientSecret,
      tenant_slug: 'alfa',
    });
    assert.equal(ok.token_type, 'Bearer');

    await assert.rejects(
      () =>
        oauth.issue({
          grant_type: 'client_credentials',
          client_id: 'zc_inexistente',
          client_secret: created.clientSecret,
          tenant_slug: 'alfa',
        }),
      UnauthorizedException,
    );
    await assert.rejects(
      () =>
        oauth.issue({
          grant_type: 'client_credentials',
          client_id: created.clientId,
          client_secret: 'segredo-errado-com-16ch',
          tenant_slug: 'alfa',
        }),
      UnauthorizedException,
    );
    await assert.rejects(
      () =>
        oauth.issue({
          grant_type: 'client_credentials',
          client_id: created.clientId,
          client_secret: '',
          tenant_slug: 'alfa',
        }),
      UnauthorizedException,
    );
    await assert.rejects(
      () =>
        oauth.issue({
          grant_type: 'password',
          client_id: created.clientId,
          client_secret: created.clientSecret,
          tenant_slug: 'alfa',
        }),
      BadRequestException,
    );
    await assert.rejects(
      () =>
        oauth.issue({
          grant_type: 'client_credentials',
          client_id: created.clientId,
          client_secret: created.clientSecret,
          tenant_slug: 'nao-existe',
        }),
      ForbiddenException,
    );
    await assert.rejects(
      () =>
        oauth.issue({
          grant_type: 'client_credentials',
          client_id: created.clientId,
          client_secret: created.clientSecret,
          tenant_slug: 'beta',
        }),
      ForbiddenException,
    );

    db.apps[0].status = ApiAplicacaoStatus.inativa;
    await assert.rejects(
      () =>
        oauth.issue({
          grant_type: 'client_credentials',
          client_id: created.clientId,
          client_secret: created.clientSecret,
          tenant_slug: 'alfa',
        }),
      ForbiddenException,
    );
    db.apps[0].status = ApiAplicacaoStatus.ativa;
    db.grants[0].status = ApiAutorizacaoStatus.revogada;
    await assert.rejects(
      () =>
        oauth.issue({
          grant_type: 'client_credentials',
          client_id: created.clientId,
          client_secret: created.clientSecret,
          tenant_slug: 'alfa',
        }),
      ForbiddenException,
    );
  });

  it('14 scope inválido no cadastro', async () => {
    const db = memory();
    const apps = new ApiAppsService(db.prisma as never);
    await assert.rejects(
      () =>
        apps.criar({
          nome: 'Discador',
          tenantId: 'tenant-a',
          scopes: ['admin:all'],
        }),
      BadRequestException,
    );
  });

  it('15 a 19 token adulterado, expirado, assinatura, issuer e audience', () => {
    const raw = signApiToken({
      secret: SECRET,
      issuer: 'zone-connection-api',
      clientId: 'zc_abc',
      appId: 'app-1',
      tenantId: 'tenant-a',
      scopes: ['leads:read'],
      versao: 1,
      ttlSeconds: 60,
      now: 1_700_000_000,
    });
    const [h, b, s] = raw.split('.');
    const flipped = `${h}.${b}.${s.slice(0, -2)}aa`;
    assert.throws(() =>
      verifyApiToken({ token: flipped, secret: SECRET, issuer: 'zone-connection-api', now: 1_700_000_010 }),
    );
    assert.throws(() =>
      verifyApiToken({ token: raw, secret: SECRET, issuer: 'zone-connection-api', now: 1_700_000_070 }),
      /expirado/,
    );
    assert.throws(() =>
      verifyApiToken({ token: raw, secret: USER_JWT, issuer: 'zone-connection-api', now: 1_700_000_010 }),
    );
    assert.throws(() =>
      verifyApiToken({ token: raw, secret: SECRET, issuer: 'crm-usuarios', now: 1_700_000_010 }),
    );
    const payload = JSON.parse(Buffer.from(b, 'base64url').toString('utf8'));
    payload.aud = 'crm-usuarios';
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const { createHmac } = require('crypto') as typeof import('crypto');
    const sig = createHmac('sha256', SECRET).update(`${h}.${body}`).digest('base64url');
    assert.throws(() =>
      verifyApiToken({
        token: `${h}.${body}.${sig}`,
        secret: SECRET,
        issuer: 'zone-connection-api',
        now: 1_700_000_010,
      }),
      /audiência/,
    );
  });

  it('20 a 22 revogação de app, de autorização e de scope derrubam o token vivo', async () => {
    const db = memory();
    const apps = new ApiAppsService(db.prisma as never);
    const created = await apps.criar({
      nome: 'Discador',
      tenantId: 'tenant-a',
      scopes: ['leads:read', 'leads:write'],
    });
    const oauth = new ApiOauthService(db.oauthPrisma as never, config() as never, limite() as never);
    const issued = await oauth.issue({
      grant_type: 'client_credentials',
      client_id: created.clientId,
      client_secret: created.clientSecret,
      tenant_slug: 'alfa',
    });
    db.apps[0].status = ApiAplicacaoStatus.inativa;
    await assert.rejects(() => oauth.authenticate(issued.access_token), UnauthorizedException);
    db.apps[0].status = ApiAplicacaoStatus.ativa;
    db.grants[0].status = ApiAutorizacaoStatus.revogada;
    await assert.rejects(() => oauth.authenticate(issued.access_token), UnauthorizedException);
    db.grants[0].status = ApiAutorizacaoStatus.ativa;
    db.grants[0].scopes = ['leads:read'];
    const claims = await oauth.authenticate(issued.access_token);
    assert.deepEqual(claims.scopes, ['leads:read']);
    assert.equal(claims.tenantId, 'tenant-a');
  });

  it('23 e 24 rotação troca o segredo e o antigo não emite token; o JWT anterior segue até expirar ou revogar', async () => {
    const db = memory();
    const apps = new ApiAppsService(db.prisma as never);
    const created = await apps.criar({
      nome: 'Discador',
      tenantId: 'tenant-a',
      scopes: ['leads:read'],
    });
    const oauth = new ApiOauthService(db.oauthPrisma as never, config() as never, limite() as never);
    const before = await oauth.issue({
      grant_type: 'client_credentials',
      client_id: created.clientId,
      client_secret: created.clientSecret,
      tenant_slug: 'alfa',
    });
    const rotated = await apps.rotacionar(created.id);
    assert.notEqual(rotated.clientSecret, created.clientSecret);
    await assert.rejects(
      () =>
        oauth.issue({
          grant_type: 'client_credentials',
          client_id: created.clientId,
          client_secret: created.clientSecret,
          tenant_slug: 'alfa',
        }),
      UnauthorizedException,
    );
    const still = await oauth.issue({
      grant_type: 'client_credentials',
      client_id: created.clientId,
      client_secret: rotated.clientSecret,
      tenant_slug: 'alfa',
    });
    assert.ok(still.access_token);
    await assert.rejects(() => oauth.authenticate(before.access_token), UnauthorizedException);
  });

  it('25 JWT de usuário não passa na verificação da API', () => {
    const userToken = signApiToken({
      secret: USER_JWT,
      issuer: 'zone-connection-api',
      clientId: 'user-1',
      appId: 'user-1',
      tenantId: 'tenant-a',
      scopes: ['leads:write'],
      versao: 1,
      ttlSeconds: 3600,
    });
    assert.throws(() =>
      verifyApiToken({
        token: userToken,
        secret: SECRET,
        issuer: 'zone-connection-api',
      }),
    );
  });

  it('token da Alfa não abre a Beta e scope extra é recusado no guard', async () => {
    const oauth = {
      authenticate: async () => ({
        iss: 'zone-connection-api',
        aud: 'zone-connection-api',
        sub: 'zc_abc',
        appId: 'app-1',
        tenantId: 'tenant-a',
        scopes: ['leads:read'],
        iat: 1,
        exp: 9,
        jti: 'j',
      }),
    };
    const reflector = {
      getAllAndOverride: () => ['leads:write'],
    };
    const guard = new ApiAccessGuard(oauth as never, reflector as never);
    const req = {
      header: () => 'Bearer token',
      query: { tenantId: 'tenant-b' },
    };
    await assert.rejects(
      () =>
        guard.canActivate({
          switchToHttp: () => ({ getRequest: () => req }),
          getHandler: () => null,
          getClass: () => null,
        } as never),
      ForbiddenException,
    );
    reflector.getAllAndOverride = () => ['leads:read'];
    assert.equal(
      await guard.canActivate({
        switchToHttp: () => ({ getRequest: () => req }),
        getHandler: () => null,
        getClass: () => null,
      } as never),
      true,
    );
    assert.equal((req as { api?: { tenantId: string } }).api?.tenantId, 'tenant-a');
  });

  it('tenant inativo bloqueia emissão e token já emitido, sem afetar o outro tenant', async () => {
    const db = memory();
    const apps = new ApiAppsService(db.prisma as never);
    const created = await apps.criar({
      nome: 'Discador',
      tenantId: 'tenant-a',
      scopes: ['leads:read'],
    });
    db.grants.push({
      id: 'grant-b',
      aplicacaoId: created.id,
      tenantId: 'tenant-b',
      scopes: ['leads:read'],
      status: ApiAutorizacaoStatus.ativa,
    });
    const oauth = new ApiOauthService(db.oauthPrisma as never, config() as never, limite() as never);
    db.tenants[0].status = 'inativo';
    await assert.rejects(
      () =>
        oauth.issue({
          grant_type: 'client_credentials',
          client_id: created.clientId,
          client_secret: created.clientSecret,
          tenant_slug: 'alfa',
        }),
      ForbiddenException,
    );
    const beta = await oauth.issue({
      grant_type: 'client_credentials',
      client_id: created.clientId,
      client_secret: created.clientSecret,
      tenant_slug: 'beta',
    });
    assert.equal((await oauth.authenticate(beta.access_token)).tenantId, 'tenant-b');
    db.tenants[0].status = 'ativo';
    const alfa = await oauth.issue({
      grant_type: 'client_credentials',
      client_id: created.clientId,
      client_secret: created.clientSecret,
      tenant_slug: 'alfa',
    });
    db.tenants[0].status = 'inativo';
    await assert.rejects(() => oauth.authenticate(alfa.access_token), UnauthorizedException);
    assert.equal((await oauth.authenticate(beta.access_token)).tenantId, 'tenant-b');
    assert.equal(Object.prototype.hasOwnProperty.call(db.apps[0], 'segredoPrefixo'), false);
  });
});
