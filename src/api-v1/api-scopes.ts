/** Escopos da API v1. O token só carrega o que a autorização gravou. */
export const API_SCOPES = [
  'properties:read',
  'leads:read',
  'leads:write',
  'leads:update',
  'funnels:read',
  'calls:write',
  'webhooks:manage',
] as const;

export type ApiScope = (typeof API_SCOPES)[number];

export function isApiScope(value: string): value is ApiScope {
  return (API_SCOPES as readonly string[]).includes(value);
}

export function assertScopes(scopes: string[]): ApiScope[] {
  const unique = [...new Set(scopes)];
  const invalid = unique.filter((scope) => !isApiScope(scope));
  if (invalid.length > 0) {
    throw new Error(`Escopo desconhecido: ${invalid.join(', ')}`);
  }
  return unique as ApiScope[];
}
