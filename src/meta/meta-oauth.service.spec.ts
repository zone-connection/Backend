import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Role } from '@prisma/client';
import { MetaOAuthService } from './meta-oauth.service';

describe('MetaOAuthService', () => {
  it('status do super_admin usa o tenant da plataforma', async () => {
    const service = new MetaOAuthService(
      {
        tenantMetaConnection: {
          findFirst: async () => null,
        },
      } as never,
      {
        get: (key: string) => {
          if (key === 'META_APP_ID') return '1';
          if (key === 'META_APP_SECRET') return 'secret-secret-16';
          if (key === 'META_OAUTH_REDIRECT_URIS') {
            return 'http://localhost:8080/api/integrations/meta/callback';
          }
          return undefined;
        },
      } as never,
      {} as never,
      {} as never,
    );

    const status = await service.status({
      id: 'u1',
      email: 'a@a.com',
      name: 'Admin',
      role: Role.super_admin,
      tenantId: null,
    });
    assert.equal(status.configured, true);
    assert.equal(status.connected, false);
  });
});
