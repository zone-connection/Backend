export type MetaGranularScope = {
  scope?: string;
  target_ids?: string[];
};

const PAGE_SCOPES = new Set([
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_metadata',
  'pages_manage_ads',
  'leads_retrieval',
]);

const AD_SCOPES = new Set(['ads_read', 'ads_management']);

export function idsFromGranularScopes(
  scopes: MetaGranularScope[] | undefined,
): { pageIds: string[]; adAccountIds: string[] } {
  const pageIds = new Set<string>();
  const adAccountIds = new Set<string>();
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
      if (PAGE_SCOPES.has(scope)) {
        pageIds.add(id);
      }
    }
  }
  return { pageIds: [...pageIds], adAccountIds: [...adAccountIds] };
}
