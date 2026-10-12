import { timingSafeEqual } from 'crypto';

/**
 * A documentação envia `Authorization: Basic base64("vivareal:SECRET_KEY")`.
 * A SECRET_KEY é do software, não do anunciante. Chave diferente → 401.
 */
export function extractGrupoZapSecret(
  authorization: string | undefined,
): string | null {
  if (!authorization) return null;
  const space = authorization.indexOf(' ');
  if (space <= 0) return null;
  const scheme = authorization.slice(0, space);
  if (scheme !== 'Basic') return null;
  const token = authorization.slice(space + 1).trim();
  if (!token) return null;

  let decoded: string;
  try {
    decoded = Buffer.from(token, 'base64').toString('utf8');
  } catch {
    return null;
  }
  if (!decoded || decoded.includes('\uFFFD')) return null;

  const colon = decoded.indexOf(':');
  if (colon < 0) return null;
  return decoded.slice(colon + 1);
}

export function grupoZapSecretsMatch(received: string, expected: string): boolean {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function isGrupoZapAuthorized(
  authorization: string | undefined,
  secret: string,
): boolean {
  const received = extractGrupoZapSecret(authorization);
  if (received == null || !secret) return false;
  return grupoZapSecretsMatch(received, secret);
}
