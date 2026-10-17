/** Origens do FRONTEND_URL (CORS aceita várias; Órulo precisa de uma só). */
export function frontendOrigins(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((item) => item.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

export function oruloPublicOrigin(raw: string | undefined): string | null {
  const origins = frontendOrigins(raw);
  if (origins.length === 0) return null;

  const preferred = origins.find((origin) => {
    try {
      const host = new URL(origin).hostname.toLowerCase();
      return host === 'www.zoneconnection.com.br' || host === 'zoneconnection.com.br';
    } catch {
      return false;
    }
  });
  if (preferred) return preferred;

  const httpsPublic = origins.find((origin) => {
    try {
      const url = new URL(origin);
      return (
        url.protocol === 'https:' &&
        url.hostname !== 'localhost' &&
        url.hostname !== '127.0.0.1'
      );
    } catch {
      return false;
    }
  });
  return httpsPublic ?? origins[0] ?? null;
}

export const ORULO_PRODUCTION_REDIRECT_URI =
  'https://www.zoneconnection.com.br/orulo-oauth-callback';

/** URI exata que a Órulo compara com a cadastrada no Client ID. */
export function resolveOruloRedirectUri(params: {
  explicit?: string | null;
  frontendUrl?: string | null;
}) {
  const explicit = params.explicit?.trim();
  if (
    explicit &&
    !explicit.includes(',') &&
    explicit.includes('/orulo-oauth-callback')
  ) {
    return canonicalizeOruloRedirect(explicit);
  }
  const origin = oruloPublicOrigin(params.frontendUrl ?? undefined);
  if (!origin) return null;
  return canonicalizeOruloRedirect(`${origin}/orulo-oauth-callback`);
}

function canonicalizeOruloRedirect(uri: string) {
  try {
    const url = new URL(uri.trim());
    const host = url.hostname.toLowerCase();
    if (host === 'zoneconnection.com.br' || host === 'www.zoneconnection.com.br') {
      return ORULO_PRODUCTION_REDIRECT_URI;
    }
    url.hash = '';
    url.search = '';
    url.pathname = '/orulo-oauth-callback';
    return url.toString().replace(/\/$/, '');
  } catch {
    return uri.trim().replace(/\/$/, '');
  }
}
