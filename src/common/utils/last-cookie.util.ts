/** Com cookies duplicados (Secure vs não-Secure, SameSite Lax vs None), o parser
 * costuma ficar com o primeiro. O último é o Set-Cookie mais recente (login). */
export function lastCookieValue(
  header: string | undefined,
  name: string,
): string | undefined {
  if (!header) return undefined;
  let last: string | undefined;
  for (const part of header.split(';')) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    if (trimmed.slice(0, eq) !== name) continue;
    const raw = trimmed.slice(eq + 1);
    try {
      last = decodeURIComponent(raw);
    } catch {
      last = raw;
    }
  }
  return last;
}

export function applyLastWinsCookies(
  cookies: Record<string, unknown> | undefined,
  header: string | undefined,
  names: readonly string[],
): void {
  if (!cookies) return;
  for (const name of names) {
    const last = lastCookieValue(header, name);
    if (last !== undefined) cookies[name] = last;
  }
}
