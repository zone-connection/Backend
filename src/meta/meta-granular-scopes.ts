export type MetaGranularScope = {
  scope?: string;
  target_ids?: string[];
};

const PAGE_SCOPES = new Set([
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_metadata',
  'pages_manage_ads',
  'pages_manage_posts',
  'pages_manage_engagement',
  'leads_retrieval',
]);

const AD_SCOPES = new Set(['ads_read', 'ads_management']);
const BUSINESS_SCOPES = new Set(['business_management']);

export function parseGranularScopes(raw: unknown): MetaGranularScope[] {
  if (!raw) return [];
  if (typeof raw === 'string') {
    try {
      return parseGranularScopes(JSON.parse(raw));
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (entry): entry is MetaGranularScope =>
      Boolean(entry) && typeof entry === 'object',
  );
}

export function idsFromGranularScopes(
  scopes: MetaGranularScope[] | undefined,
): { pageIds: string[]; adAccountIds: string[]; businessIds: string[] } {
  const pageIds = new Set<string>();
  const adAccountIds = new Set<string>();
  const businessIds = new Set<string>();
  for (const entry of scopes ?? []) {
    const scope = entry.scope?.trim();
    if (!scope) continue;
    for (const raw of entry.target_ids ?? []) {
      const id = String(raw).trim();
      if (!id) continue;
      if (AD_SCOPES.has(scope) || id.startsWith('act_')) {
        adAccountIds.add(id.startsWith('act_') ? id : `act_${id}`);
        continue;
      }
      if (BUSINESS_SCOPES.has(scope)) {
        businessIds.add(id);
        continue;
      }
      if (PAGE_SCOPES.has(scope) || scope.startsWith('pages_')) {
        pageIds.add(id);
        continue;
      }
      if (/^\d+$/.test(id)) {
        pageIds.add(id);
      }
    }
  }
  return {
    pageIds: [...pageIds],
    adAccountIds: [...adAccountIds],
    businessIds: [...businessIds],
  };
}
