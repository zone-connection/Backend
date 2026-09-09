import type { CookieOptions, Response } from 'express';
import { ConfigService } from '@nestjs/config';

/** Nomes dos cookies de autenticação. */
export const COOKIE = {
  access: 'crm_access',
  refresh: 'crm_refresh',
  /** NÃO é httpOnly — o frontend lê e reenvia no header X-CSRF-Token. */
  csrf: 'crm_csrf',
} as const;

/** Sessão do Portal do Proprietário — não colide com cookies do CRM interno. */
export const PORTAL_COOKIE = {
  access: 'crm_portal_access',
  refresh: 'crm_portal_refresh',
  csrf: 'crm_portal_csrf',
} as const;

export const CSRF_HEADER = 'x-csrf-token';

const AUTH_COOKIE_NAMES = [COOKIE.access, COOKIE.refresh, COOKIE.csrf] as const;

/** Converte "15m" / "7d" em milissegundos para maxAge do cookie. */
export function parseDurationMs(value: string, fallbackMs: number): number {
  const match = /^(\d+)(s|m|h|d)$/.exec(value.trim());
  if (!match) return fallbackMs;
  const amount = Number(match[1]);
  const unit = match[2];
  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  return amount * (multipliers[unit] ?? 1);
}

type SameSite = 'lax' | 'none' | 'strict';

function frontendUsesHttps(config: ConfigService): boolean {
  const raw = config.get<string>('FRONTEND_URL') ?? '';
  return raw.split(',').some((u) => u.trim().startsWith('https://'));
}

/**
 * SameSite dos cookies de sessão.
 *
 * Sempre Lax (ou Strict se pedido). SameSite=None exige Secure; o rewrite
 * HTTP da Vercel para o Dokploy costuma entregar o cookie sem Secure e o
 * Firefox descarta crm_access/refresh/csrf.
 */
function resolveSameSite(config: ConfigService): SameSite {
  const raw = config.get<string>('COOKIE_SAMESITE')?.trim().toLowerCase();
  if (raw === 'strict') return 'strict';
  return 'lax';
}

/**
 * Secure no cookie do browser (Vercel HTTPS), mesmo se o Nest recebe HTTP
 * do rewrite Vercel → Dokploy.
 *
 * SameSite=None exige Secure. COOKIE_SECURE=false não pode desligar isso.
 */
export function resolveCookieSecure(config: ConfigService): boolean {
  if (resolveSameSite(config) === 'none') return true;
  const raw = config.get<string>('COOKIE_SECURE')?.trim().toLowerCase();
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  if (frontendUsesHttps(config)) return true;
  return config.get<string>('NODE_ENV') === 'production';
}

function baseCookieOptions(config: ConfigService): CookieOptions {
  const sameSite = resolveSameSite(config);
  return {
    httpOnly: true,
    secure: resolveCookieSecure(config),
    sameSite,
    path: '/api',
    ...(sameSite === 'none' ? { partitioned: true } : {}),
  };
}

/**
 * Cookie CSRF legível por JS em qualquer rota do frontend.
 * path "/" é obrigatório: document.cookie só expõe cookies cujo path
 * casa com a página atual — com path "/api" a tela /configuracoes
 * nunca consegue ler o token e as mutações falham com 403.
 */
function csrfCookieOptions(config: ConfigService): CookieOptions {
  return {
    ...baseCookieOptions(config),
    httpOnly: false,
    path: '/',
  };
}

/**
 * O browser só apaga o cookie se path/secure/sameSite/partitioned baterem.
 * Depois de trocar a API (HTTPS→HTTP, Lax↔None) ficam duplicatas e o
 * Express lê o JWT/CSRF antigo → 401/403.
 */
function clearCookieAllVariants(
  res: Response,
  name: string,
  httpOnly: boolean,
): void {
  const paths = ['/', '/api'] as const;
  const sameSites: SameSite[] = ['lax', 'none', 'strict'];
  for (const path of paths) {
    for (const secure of [true, false]) {
      for (const sameSite of sameSites) {
        // Firefox recusa SameSite=None sem Secure — não emitir esse header.
        if (sameSite === 'none' && !secure) continue;
        const partitionedOpts =
          sameSite === 'none' ? [true, false] : [false];
        for (const partitioned of partitionedOpts) {
          const opts: CookieOptions = {
            httpOnly,
            path,
            secure,
            sameSite,
            maxAge: 0,
            ...(partitioned ? { partitioned: true } : {}),
          };
          res.clearCookie(name, opts);
        }
      }
    }
  }
}

function clearAllAuthCookieVariants(res: Response): void {
  clearCookieAllVariants(res, COOKIE.access, true);
  clearCookieAllVariants(res, COOKIE.refresh, true);
  clearCookieAllVariants(res, COOKIE.csrf, false);
}

export function setAuthCookies(
  res: Response,
  config: ConfigService,
  tokens: { accessToken: string; refreshToken: string; csrfToken: string },
): void {
  const accessMs = parseDurationMs(
    config.get<string>('JWT_ACCESS_EXPIRES_IN', '15m'),
    15 * 60_000,
  );
  const refreshMs = parseDurationMs(
    config.get<string>('JWT_REFRESH_EXPIRES_IN', '7d'),
    7 * 86_400_000,
  );
  const base = baseCookieOptions(config);

  clearAllAuthCookieVariants(res);

  res.cookie(COOKIE.access, tokens.accessToken, {
    ...base,
    maxAge: accessMs,
  });

  res.cookie(COOKIE.refresh, tokens.refreshToken, {
    ...base,
    maxAge: refreshMs,
  });

  res.cookie(COOKIE.csrf, tokens.csrfToken, {
    ...csrfCookieOptions(config),
    maxAge: refreshMs,
  });
}

export function clearAuthCookies(res: Response, _config?: ConfigService): void {
  clearAllAuthCookieVariants(res);
}

function clearAllPortalCookieVariants(res: Response): void {
  clearCookieAllVariants(res, PORTAL_COOKIE.access, true);
  clearCookieAllVariants(res, PORTAL_COOKIE.refresh, true);
  clearCookieAllVariants(res, PORTAL_COOKIE.csrf, false);
}

export function setPortalAuthCookies(
  res: Response,
  config: ConfigService,
  tokens: { accessToken: string; refreshToken: string; csrfToken: string },
): void {
  const accessMs = parseDurationMs(
    config.get<string>('JWT_ACCESS_EXPIRES_IN', '15m'),
    15 * 60_000,
  );
  const refreshMs = parseDurationMs(
    config.get<string>('JWT_REFRESH_EXPIRES_IN', '7d'),
    7 * 86_400_000,
  );
  const base = baseCookieOptions(config);

  clearAllPortalCookieVariants(res);

  res.cookie(PORTAL_COOKIE.access, tokens.accessToken, {
    ...base,
    maxAge: accessMs,
  });

  res.cookie(PORTAL_COOKIE.refresh, tokens.refreshToken, {
    ...base,
    maxAge: refreshMs,
  });

  res.cookie(PORTAL_COOKIE.csrf, tokens.csrfToken, {
    ...csrfCookieOptions(config),
    maxAge: refreshMs,
  });
}

export function clearPortalAuthCookies(res: Response): void {
  clearAllPortalCookieVariants(res);
}

export { AUTH_COOKIE_NAMES };
