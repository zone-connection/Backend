import type { StoredImage } from '../media/stored-image';

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value.replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asInt(value: unknown): number | null {
  const n = asNumber(value);
  if (n == null) return null;
  return Math.round(n);
}

export function collectMediaIds(payload: unknown, key: string): string[] {
  const rec = asRecord(payload);
  const list = rec?.[key];
  if (!Array.isArray(list)) return [];
  const ids: string[] = [];
  for (const item of list) {
    const row = asRecord(item);
    const id = asString(row?.id);
    if (id) ids.push(id);
  }
  return ids;
}

function collectUrls(value: unknown, out: string[]) {
  if (typeof value === 'string' && /^https?:\/\//i.test(value)) {
    out.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectUrls(item, out);
    return;
  }
  const rec = asRecord(value);
  if (!rec) return;
  const preferred = [
    rec['1200x800'],
    rec['1024x768'],
    rec['800x600'],
    rec.url,
    rec.src,
  ];
  for (const candidate of preferred) {
    if (typeof candidate === 'string' && /^https?:\/\//i.test(candidate)) {
      out.push(candidate);
      return;
    }
  }
  for (const nested of Object.values(rec)) collectUrls(nested, out);
}

export function extractMediaUrls(payload: unknown): StoredImage[] {
  const urls: string[] = [];
  collectUrls(payload, urls);
  const seen = new Set<string>();
  const images: StoredImage[] = [];
  for (const url of urls) {
    if (seen.has(url)) continue;
    seen.add(url);
    images.push({ url, publicId: '' });
  }
  return images;
}

export function idsChanged(prev: string[], next: string[]) {
  if (prev.length !== next.length) return true;
  const set = new Set(prev);
  return next.some((id) => !set.has(id));
}

export function mapBuildingToEmpreendimento(building: Record<string, unknown>) {
  const address = asRecord(building.address) ?? {};
  const developer = asRecord(building.developer) ?? {};
  const street = [asString(address.street), asString(address.number)]
    .filter(Boolean)
    .join(', ');
  const neighborhood = asString(address.neighborhood);
  const endereco = [street, neighborhood].filter(Boolean).join(' — ') || null;
  const cidade = asString(address.city);
  const name = asString(building.name) ?? `Empreendimento ${building.id}`;
  const minPrice =
    asInt(building.min_price) ?? asInt(building.min_price_brl) ?? null;
  const delivery =
    asString(building.delivery_date) ??
    asString(building.estimated_delivery_date);
  const oruloUrl =
    asString(building.orulo_url) ?? asString(building.website);

  return {
    nome: name,
    cidade,
    endereco,
    tipo: asString(building.type) ?? asString(building.building_type),
    status: asString(building.status),
    previsaoEntrega: delivery?.slice(0, 10) ?? null,
    quartos: asInt(building.min_bedrooms) ?? asInt(building.min_bedroom),
    banheiros: asInt(building.min_bathroom) ?? asInt(building.min_bathrooms),
    vagas: asInt(building.min_parking) ?? asInt(building.min_parking_spaces),
    valorReferencia: minPrice,
    areaM2: asNumber(building.min_area),
    observacao: asString(building.description),
    externalUrl: oruloUrl,
    developerName: asString(developer.name),
    imageIds: collectMediaIds(building, 'images'),
    floorPlanIds: collectMediaIds(building, 'floor_plans'),
  };
}
