import { createHmac, timingSafeEqual } from 'crypto';

export type MetaSignatureResult =
  | 'ok'
  | 'missing_header'
  | 'invalid'
  | 'missing_body';

/**
 * Valida `X-Hub-Signature-256` (HMAC-SHA256 do raw body com o App Secret).
 * Não registra nem devolve o secret, o body ou a assinatura.
 */
export function verifyMetaSignature256(
  rawBody: Buffer | undefined,
  signatureHeader: string | undefined,
  appSecret: string,
): MetaSignatureResult {
  if (!signatureHeader?.startsWith('sha256=')) {
    return 'missing_header';
  }
  if (!rawBody?.length) {
    return 'missing_body';
  }

  const expected = createHmac('sha256', appSecret)
    .update(rawBody)
    .digest('hex');
  const received = signatureHeader.slice('sha256='.length);

  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return 'invalid';
  }
  return 'ok';
}
