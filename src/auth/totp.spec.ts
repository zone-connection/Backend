import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  consumeBackupCode,
  generateBackupCodes,
  generateTotpSecret,
  hashBackupCode,
  otpauthUrl,
  roleNeedsTotp,
  totpCode,
  totpValid,
} from './totp';

describe('totp', () => {
  it('aceita o código atual e rejeita um código errado', () => {
    const secret = generateTotpSecret();
    const now = Date.parse('2026-10-10T16:00:00.000Z');
    const code = totpCode(secret, now);
    assert.equal(code.length, 6);
    assert.equal(totpValid(secret, code, now), true);
    assert.equal(totpValid(secret, '000000', now), false);
  });

  it('aceita o passo anterior da janela', () => {
    const secret = generateTotpSecret();
    const now = Date.parse('2026-10-10T16:00:15.000Z');
    const previous = totpCode(secret, now - 30_000);
    assert.equal(totpValid(secret, previous, now), true);
  });

  it('monta a URL otpauth', () => {
    const url = otpauthUrl({
      email: 'admin@imob.com',
      secret: 'ABCDEF',
    });
    assert.match(url, /^otpauth:\/\/totp\//);
    assert.match(url, /secret=ABCDEF/);
  });
});

describe('backup codes', () => {
  it('consome um código uma vez', () => {
    const codes = generateBackupCodes(8);
    assert.equal(codes.length, 8);
    const hashes = codes.map(hashBackupCode);
    const next = consumeBackupCode(hashes, codes[0]);
    assert.ok(next);
    assert.equal(next.length, 7);
    assert.equal(consumeBackupCode(next, codes[0]), null);
  });
});

describe('roleNeedsTotp', () => {
  it('vale só para admin e super admin', () => {
    assert.equal(roleNeedsTotp('admin'), true);
    assert.equal(roleNeedsTotp('super_admin'), true);
    assert.equal(roleNeedsTotp('corretor'), false);
    assert.equal(roleNeedsTotp('gerente'), false);
  });
});
