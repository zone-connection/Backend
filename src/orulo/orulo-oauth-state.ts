import { createHmac, timingSafeEqual } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { oruloTokenKey } from './orulo-token.crypto';

const TTL_MS = 15 * 60 * 1000;

export type OruloOAuthStatePayload = {
  uid: string;
  tid: string;
  returnTo: string;
  exp: number;
};

export function safeOruloReturnTo(raw?: string | null) {
  const value = (raw ?? '').trim();
  if (!value.startsWith('/') || value.startsWith('//')) return '/imoveis';
  if (value.startsWith('/orulo')) return '/imoveis';
  if (value.startsWith('/login')) return '/imoveis';
  return value.slice(0, 500);
}

export function signOruloOAuthState(
  payload: Omit<OruloOAuthStatePayload, 'exp'>,
  config: ConfigService,
) {
  const body: OruloOAuthStatePayload = {
    ...payload,
    returnTo: safeOruloReturnTo(payload.returnTo),
    exp: Date.now() + TTL_MS,
  };
  const encoded = Buffer.from(JSON.stringify(body)).toString('base64url');
  const sig = createHmac('sha256', oruloTokenKey(config))
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifyOruloOAuthState(
  state: string,
  config: ConfigService,
): OruloOAuthStatePayload | null {
  const [encoded, sig] = state.split('.');
  if (!encoded || !sig) return null;
  const expected = createHmac('sha256', oruloTokenKey(config))
    .update(encoded)
    .digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8'),
    ) as OruloOAuthStatePayload;
    if (!payload?.uid || !payload?.tid || payload.exp < Date.now()) return null;
    return {
      ...payload,
      returnTo: safeOruloReturnTo(payload.returnTo),
    };
  } catch {
    return null;
  }
}
