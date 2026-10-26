import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  decryptSecret,
  encryptSecret,
  totpCode,
  totpMatches,
} from './totp.util';

describe('totp', () => {
  it('aceita o código do período atual e rejeita lixo', () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    const now = 1_700_000_000_000;
    const code = totpCode(secret, now);
    assert.equal(totpMatches(secret, code, now), true);
    assert.equal(totpMatches(secret, '000000', now), code === '000000');
    assert.equal(totpMatches(secret, '12', now), false);
  });

  it('cifra o segredo sem devolver o texto puro', () => {
    const enc = encryptSecret('JBSWY3DPEHPK3PXP', 'material-teste');
    assert.equal(enc.includes('JBSWY3DPEHPK3PXP'), false);
    assert.equal(decryptSecret(enc, 'material-teste'), 'JBSWY3DPEHPK3PXP');
  });
});
