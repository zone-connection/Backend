import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'crypto';

export const API_TOKEN_ISS_DEFAULT = 'zone-connection-api';
export const API_TOKEN_AUD = 'zone-connection-api';

export type ApiAccessClaims = {
  iss: string;
  aud: string;
  sub: string;
  appId: string;
  tenantId: string;
  scopes: string[];
  ver: number;
  iat: number;
  exp: number;
  jti: string;
};

function b64url(input: Buffer | string): string {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf.toString('base64url');
}

function sign(secret: string, signingInput: string): string {
  return createHmac('sha256', secret).update(signingInput).digest('base64url');
}

export function signApiToken(params: {
  secret: string;
  issuer: string;
  clientId: string;
  appId: string;
  tenantId: string;
  scopes: string[];
  versao: number;
  ttlSeconds: number;
  now?: number;
}): string {
  const now = params.now ?? Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload: ApiAccessClaims = {
    iss: params.issuer,
    aud: API_TOKEN_AUD,
    sub: params.clientId,
    appId: params.appId,
    tenantId: params.tenantId,
    scopes: params.scopes,
    ver: params.versao,
    iat: now,
    exp: now + params.ttlSeconds,
    jti: randomUUID(),
  };
  const body = b64url(JSON.stringify(payload));
  const signingInput = `${header}.${body}`;
  return `${signingInput}.${sign(params.secret, signingInput)}`;
}

export function verifyApiToken(params: {
  token: string;
  secret: string;
  issuer: string;
  now?: number;
}): ApiAccessClaims {
  const parts = params.token.split('.');
  if (parts.length !== 3) {
    throw new Error('token malformado');
  }
  const [header, body, signature] = parts;
  const expected = sign(params.secret, `${header}.${body}`);
  const got = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (got.length !== expBuf.length || !timingSafeEqual(got, expBuf)) {
    throw new Error('assinatura inválida');
  }
  let headerJson: { alg?: string };
  let claims: ApiAccessClaims;
  try {
    headerJson = JSON.parse(Buffer.from(header, 'base64url').toString('utf8'));
    claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    throw new Error('token malformado');
  }
  if (headerJson.alg !== 'HS256') throw new Error('algoritmo inválido');
  if (claims.iss !== params.issuer) throw new Error('emissor inválido');
  if (claims.aud !== API_TOKEN_AUD) throw new Error('audiência inválida');
  const now = params.now ?? Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== 'number' || claims.exp <= now) {
    throw new Error('token expirado');
  }
  if (!claims.appId || !claims.tenantId || !Array.isArray(claims.scopes) || typeof claims.ver !== 'number') {
    throw new Error('claims inválidas');
  }
  return claims;
}

export function generateClientId(): string {
  return `zc_${randomBytes(12).toString('hex')}`;
}

export function generateClientSecret(): string {
  return randomBytes(32).toString('base64url');
}
