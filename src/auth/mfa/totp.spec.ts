import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { totpCode, totpMatches } from './totp';

describe('TOTP', () => {
  it('aceita o código atual e rejeita reutilização', () => {
    const secret = Buffer.from('zone-connection-totp-secret');
    const now = Date.UTC(2026, 10, 4, 12, 0, 0);
    const current = totpCode(secret, now);
    assert.equal(totpMatches(secret, current.code, null, now).ok, true);
    assert.equal(totpMatches(secret, current.code, current.step, now).ok, false);
    assert.equal(totpMatches(secret, '000000', null, now).ok, false);
  });
});