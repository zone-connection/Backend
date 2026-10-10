import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ConfigService } from '@nestjs/config';
import {
  decryptPageAccessToken,
  encryptSecret,
  metaTokenKey,
} from './meta-token.crypto';

describe('meta-token.crypto', () => {
  const config = {
    get: (key: string) =>
      key === 'JWT_ACCESS_SECRET' ? 'x'.repeat(48) : undefined,
  } as ConfigService;

  it('cifra e decifra o page token', () => {
    const key = metaTokenKey(config);
    const enc = encryptSecret('EAAplainToken', key);
    assert.notEqual(enc, 'EAAplainToken');
    assert.equal(decryptPageAccessToken(enc, key), 'EAAplainToken');
  });

  it('mantém token legado em texto plano', () => {
    const key = metaTokenKey(config);
    assert.equal(decryptPageAccessToken('EAAlegado', key), 'EAAlegado');
  });
});
