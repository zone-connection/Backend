import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createHmac } from 'crypto';
import { verifyMetaSignature256 } from './meta-signature';

const SECRET = 'meta-app-secret-for-tests';
const BODY = Buffer.from('{"object":"page","entry":[]}');

function sign(body: Buffer, secret: string) {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

describe('verifyMetaSignature256', () => {
  it('aceita assinatura válida', () => {
    assert.equal(
      verifyMetaSignature256(BODY, sign(BODY, SECRET), SECRET),
      'ok',
    );
  });

  it('rejeita assinatura inválida', () => {
    assert.equal(
      verifyMetaSignature256(BODY, sign(BODY, 'outro-secret'), SECRET),
      'invalid',
    );
  });

  it('rejeita header ausente', () => {
    assert.equal(verifyMetaSignature256(BODY, undefined, SECRET), 'missing_header');
  });

  it('rejeita header sem prefixo sha256=', () => {
    assert.equal(
      verifyMetaSignature256(BODY, 'md5=abc', SECRET),
      'missing_header',
    );
  });

  it('rejeita rawBody ausente', () => {
    assert.equal(
      verifyMetaSignature256(undefined, sign(BODY, SECRET), SECRET),
      'missing_body',
    );
  });
});
