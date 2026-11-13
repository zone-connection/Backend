import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { signApiToken, verifyApiToken } from './api-token';

const secret = 'api-secret-api-secret-api-secret-32';
const issuer = 'zone-connection-api';

function token(over: Partial<Parameters<typeof signApiToken>[0]> = {}) {
  return signApiToken({
    secret,
    issuer,
    clientId: 'zc_test',
    appId: 'app-1',
    tenantId: 'tenant-a',
    scopes: ['leads:read'],
    versao: 1,
    ttlSeconds: 3600,
    now: 1_700_000_000,
    ...over,
  });
}

describe('token da API v1', () => {
  it('emite e valida claims', () => {
    const raw = token();
    const claims = verifyApiToken({ token: raw, secret, issuer, now: 1_700_000_100 });
    assert.equal(claims.tenantId, 'tenant-a');
    assert.equal(claims.aud, 'zone-connection-api');
    assert.equal(claims.iss, issuer);
    assert.deepEqual(claims.scopes, ['leads:read']);
    assert.ok(claims.jti);
  });

  it('rejeita assinatura inválida', () => {
    assert.throws(() =>
      verifyApiToken({
        token: token(),
        secret: 'outro-segredo-outro-segredo-outro-32',
        issuer,
        now: 1_700_000_100,
      }),
    );
  });

  it('rejeita token expirado', () => {
    const raw = token({ ttlSeconds: 60, now: 1_700_000_000 });
    assert.throws(
      () => verifyApiToken({ token: raw, secret, issuer, now: 1_700_000_061 }),
      /expirado/,
    );
  });

  it('rejeita emissor diferente', () => {
    assert.throws(() =>
      verifyApiToken({ token: token(), secret, issuer: 'crm-usuarios', now: 1_700_000_100 }),
    );
  });
});
