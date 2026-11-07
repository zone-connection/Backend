import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ApiAplicacaoStatus, ApiAutorizacaoStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { ApiOauthService } from './api-oauth.service';
import { signApiToken } from './api-token';

const SECRET = 'api-secret-api-secret-api-secret-32';

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

describe('ApiOauthService', () => {
  it('emite token quando a autorização do slug existe', async () => {
    const hash = await bcrypt.hash('segredo-valido-32chars', 4);
    const prisma = {
      apiAplicacao: {
        findUnique: async () => ({
          id: 'app-1',
          status: ApiAplicacaoStatus.ativa,
          credencialVersao: 1,
          segredoHash: hash,
          autorizacoes: [
            {
              status: ApiAutorizacaoStatus.ativa,
              scopes: ['leads:read', 'leads:write'],
              tenantId: 'tenant-a',
              tenant: { status: 'ativo' },
            },
          ],
        }),
      },
      apiAutorizacao: {
        findUnique: async () => ({
          status: ApiAutorizacaoStatus.ativa,
          scopes: ['leads:read', 'leads:write'],
          aplicacao: { status: ApiAplicacaoStatus.ativa, clientId: 'zc_abc', credencialVersao: 1 },
          tenant: { status: 'ativo' },
        }),
      },
    };
    const service = new ApiOauthService(prisma as never, config() as never, limite() as never);
    const issued = await service.issue({
      grant_type: 'client_credentials',
      client_id: 'zc_abc',
      client_secret: 'segredo-valido-32chars',
      tenant_slug: 'alfa',
    });
    assert.equal(issued.token_type, 'Bearer');
    assert.equal(issued.expires_in, 3600);
    const claims = await service.authenticate(issued.access_token);
    assert.equal(claims.tenantId, 'tenant-a');
    assert.deepEqual(claims.scopes, ['leads:read', 'leads:write']);
  });

  it('rejeita client id inexistente e segredo incorreto com o mesmo código', async () => {
    const hash = await bcrypt.hash('segredo-valido-32chars', 4);
    const prisma = {
      apiAplicacao: {
        findUnique: async ({ where }: { where: { clientId: string } }) =>
          where.clientId === 'zc_abc'
            ? {
                id: 'app-1',
                status: ApiAplicacaoStatus.ativa,
                segredoHash: hash,
                autorizacoes: [],
              }
            : null,
      },
    };
    const service = new ApiOauthService(prisma as never, config() as never, limite() as never);
    await assert.rejects(
      () =>
        service.issue({
          grant_type: 'client_credentials',
          client_id: 'zc_nao',
          client_secret: 'segredo-valido-32chars',
          tenant_slug: 'alfa',
        }),
      (err: unknown) => err instanceof UnauthorizedException,
    );
    await assert.rejects(
      () =>
        service.issue({
          grant_type: 'client_credentials',
          client_id: 'zc_abc',
          client_secret: 'segredo-errado-32chars',
          tenant_slug: 'alfa',
        }),
      (err: unknown) => err instanceof UnauthorizedException,
    );
  });

  it('rejeita aplicação inativa, autorização revogada e tenant sem vínculo', async () => {
    const hash = await bcrypt.hash('segredo-valido-32chars', 4);
    const cases = [
      {
        status: ApiAplicacaoStatus.inativa,
        autorizacoes: [
          {
            status: ApiAutorizacaoStatus.ativa,
            scopes: ['leads:read'],
            tenantId: 'tenant-a',
          },
        ],
        error: ForbiddenException,
      },
      {
        status: ApiAplicacaoStatus.ativa,
        autorizacoes: [
          {
            status: ApiAutorizacaoStatus.revogada,
            scopes: ['leads:read'],
            tenantId: 'tenant-a',
          },
        ],
        error: ForbiddenException,
      },
      {
        status: ApiAplicacaoStatus.ativa,
        autorizacoes: [],
        error: ForbiddenException,
      },
    ];
    for (const item of cases) {
      const prisma = {
        apiAplicacao: {
          findUnique: async () => ({
            id: 'app-1',
            status: item.status,
            segredoHash: hash,
            autorizacoes: item.autorizacoes,
          }),
        },
      };
      const service = new ApiOauthService(prisma as never, config() as never, limite() as never);
      await assert.rejects(
        () =>
          service.issue({
            grant_type: 'client_credentials',
            client_id: 'zc_abc',
            client_secret: 'segredo-valido-32chars',
            tenant_slug: 'beta',
          }),
        (err: unknown) => err instanceof item.error,
      );
    }
  });

  it('não aceita o tenant do token se a autorização viva for de outro', async () => {
    const hash = await bcrypt.hash('segredo-valido-32chars', 4);
    const prisma = {
      apiAplicacao: {
        findUnique: async () => ({
          id: 'app-1',
          status: ApiAplicacaoStatus.ativa,
          credencialVersao: 1,
          segredoHash: hash,
          autorizacoes: [
            {
              status: ApiAutorizacaoStatus.ativa,
              scopes: ['leads:read'],
              tenantId: 'tenant-a',
              tenant: { status: 'ativo' },
            },
          ],
        }),
      },
      apiAutorizacao: {
        findUnique: async ({
          where,
        }: {
          where: { aplicacaoId_tenantId: { tenantId: string } };
        }) => {
          if (where.aplicacaoId_tenantId.tenantId !== 'tenant-a') return null;
          return {
            status: ApiAutorizacaoStatus.ativa,
            scopes: ['leads:read'],
            aplicacao: { status: ApiAplicacaoStatus.ativa, clientId: 'zc_abc', credencialVersao: 1 },
            tenant: { status: 'ativo' },
          };
        },
      },
    };
    const service = new ApiOauthService(prisma as never, config() as never, limite() as never);
    const issued = await service.issue({
      grant_type: 'client_credentials',
      client_id: 'zc_abc',
      client_secret: 'segredo-valido-32chars',
      tenant_slug: 'alfa',
    });
    const ok = await service.authenticate(issued.access_token);
    assert.equal(ok.tenantId, 'tenant-a');

    const forged = signApiToken({
      secret: SECRET,
      issuer: 'zone-connection-api',
      clientId: 'zc_abc',
      appId: 'app-1',
      tenantId: 'tenant-b',
      scopes: ['leads:read', 'webhooks:manage'],
      versao: 1,
      ttlSeconds: 3600,
    });
    await assert.rejects(
      () => service.authenticate(forged),
      (err: unknown) => err instanceof UnauthorizedException,
    );
  });

  it('remove scope que a autorização não tem mais', async () => {
    const prisma = {
      apiAplicacao: { findUnique: async () => null },
      apiAutorizacao: {
        findUnique: async () => ({
          status: ApiAutorizacaoStatus.ativa,
          scopes: ['leads:read'],
          aplicacao: { status: ApiAplicacaoStatus.ativa, clientId: 'zc_abc', credencialVersao: 1 },
          tenant: { status: 'ativo' },
        }),
      },
    };
    const service = new ApiOauthService(prisma as never, config() as never, limite() as never);
    const raw = signApiToken({
      secret: SECRET,
      issuer: 'zone-connection-api',
      clientId: 'zc_abc',
      appId: 'app-1',
      tenantId: 'tenant-a',
      scopes: ['leads:read', 'webhooks:manage'],
      versao: 1,
      ttlSeconds: 3600,
    });
    const claims = await service.authenticate(raw);
    assert.deepEqual(claims.scopes, ['leads:read']);
  });
});
