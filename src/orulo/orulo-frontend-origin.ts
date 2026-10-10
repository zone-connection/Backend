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
