import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

const CALLBACK_PATH = '/api/integrations/meta/callback';

/** App Meta já usado no webhook Lead Ads (guia da plataforma). */
export const DEFAULT_META_APP_ID = '1079705831674949';

const DEFAULT_CALLBACK_ORIGINS = [
  'http://localhost:8080',
  'http://localhost:5173',
  'https://www.zoneconnection.com.br',
  'https://zoneconnection.com.br',
];

export function resolveMetaAppId(config: ConfigService): string {
  return config.get<string>('META_APP_ID')?.trim() || DEFAULT_META_APP_ID;
}

function originsFromFrontendUrl(config: ConfigService): string[] {
  const raw = config.get<string>('FRONTEND_URL') ?? '';
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      try {
        return new URL(item).origin;
      } catch {
        return item.replace(/\/$/, '');
      }
    });
}

export function parseMetaAllowedRedirectUris(config: ConfigService): string[] {
  const list = config.get<string>('META_OAUTH_REDIRECT_URIS') ?? '';
  const single = config.get<string>('META_OAUTH_REDIRECT_URI') ?? '';
  const explicit = `${list},${single}`
    .split(',')
    .map((item) => item.trim().replace(/\/$/, ''))
    .filter(Boolean);
  const derived = [
    ...originsFromFrontendUrl(config),
    ...DEFAULT_CALLBACK_ORIGINS,
  ].map((origin) => `${origin.replace(/\/$/, '')}${CALLBACK_PATH}`);
  return [...new Set([...explicit, ...derived])];
}

export function metaOAuthConfigured(config: ConfigService): boolean {
  return Boolean(
    config.get<string>('META_APP_SECRET')?.trim() && resolveMetaAppId(config),
  );
}

function originFromRequest(req: Request): string | null {
  const headerOrigin = req.get('origin')?.trim();
  if (headerOrigin) return headerOrigin.replace(/\/$/, '');
  const referer = req.get('referer');
  if (referer) {
    try {
      return new URL(referer).origin;
    } catch {
      /* ignore */
    }
  }
  return null;
}

export function pickMetaRedirectUri(
  req: Request,
  allowed: string[],
  returnOrigin?: string,
): string {
  const origin = (returnOrigin ?? originFromRequest(req) ?? '')
    .trim()
    .replace(/\/$/, '');
  if (origin) {
    const wanted = `${origin}${CALLBACK_PATH}`;
    const match = allowed.find((uri) => uri === wanted);
    if (match) return match;
    return wanted;
  }

  if (allowed.length === 0) {
    throw new BadRequestException(
      'Não foi possível montar o redirect OAuth do Facebook.',
    );
  }

  const production = allowed.find(
    (uri) => !uri.includes('localhost') && !uri.includes('127.0.0.1'),
  );
  return production ?? allowed[0];
}

export function frontendMetaOAuthReturnUrl(
  redirectUri: string,
  result: 'select' | 'error' | 'denied',
): string {
  const origin = new URL(redirectUri).origin;
  return `${origin}/configuracoes?secao=conta&item=conexoes&meta=${result}`;
}
