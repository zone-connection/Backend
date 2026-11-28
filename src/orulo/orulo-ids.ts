/** A API oficial usa `buildings[].id` (string). O guia do CRM cita `building_ids`. */
export function extractOruloBuildingIds(payload: unknown): number[] {
  if (!payload || typeof payload !== 'object') return [];
  const rec = payload as Record<string, unknown>;
  const lists = [rec.buildings, rec.building_ids, rec.ids];
  const ids: number[] = [];
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      const raw =
        typeof item === 'number' || typeof item === 'string'
          ? item
          : item && typeof item === 'object'
            ? (item as { id?: unknown }).id
            : null;
      const id = Number(raw);
      if (Number.isFinite(id) && id > 0) ids.push(id);
    }
  }
  return [...new Set(ids)];
}

export function oruloTotalPages(payload: unknown, page: number): number {
  if (!payload || typeof payload !== 'object') return page;
  const rec = payload as Record<string, unknown>;
  const total = Number(rec.total_pages);
  return Number.isFinite(total) && total > 0 ? total : page;
}
