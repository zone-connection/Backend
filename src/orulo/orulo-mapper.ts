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

function httpsUrl(value: unknown): string | null {
  return typeof value === 'string' && /^https?:\/\//i.test(value)
    ? value
    : null;
}

function pickSizedUrl(
  rec: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const url = httpsUrl(rec[key]);
    if (url) return url;
  }
  return httpsUrl(rec.url) ?? httpsUrl(rec.src);
}

function collectImages(value: unknown, out: StoredImage[]) {
  if (typeof value === 'string' && /^https?:\/\//i.test(value)) {
    out.push({ url: value, publicId: '' });
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectImages(item, out);
    return;
  }
  const rec = asRecord(value);
  if (!rec) return;
  const thumb = pickSizedUrl(rec, ['520x280', '200x140']);
  const large = pickSizedUrl(rec, ['1024x1024', '2280x1800']);
  const url = thumb ?? large;
  if (url) {
    out.push({
      url,
      publicId: '',
      ...(large && large !== url ? { largeUrl: large } : {}),
    });
    return;
  }
  for (const nested of Object.values(rec)) {
    if (nested && typeof nested === 'object') collectImages(nested, out);
  }
}

export function extractMediaUrls(payload: unknown): StoredImage[] {
  const collected: StoredImage[] = [];
  collectImages(payload, collected);
  const seen = new Set<string>();
  const images: StoredImage[] = [];
  for (const image of collected) {
    if (seen.has(image.url)) continue;
    seen.add(image.url);
    images.push(image);
  }
  return images;
}

export function idsChanged(prev: string[], next: string[]) {
  if (prev.length !== next.length) return true;
  const set = new Set(prev);
  return next.some((id) => !set.has(id));
}

function featureNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const names: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const label =
      typeof item === 'string'
        ? item.trim()
        : asString(asRecord(item)?.name) ??
          asString(asRecord(item)?.title) ??
          asString(asRecord(item)?.description);
    if (!label) continue;
    const key = label.toLocaleLowerCase('pt-BR');
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(label);
  }
  return names;
}

export function extractTypologies(value: unknown) {
  const rec = asRecord(value);
  const list = Array.isArray(value)
    ? value
    : Array.isArray(rec?.typologies)
      ? rec.typologies
      : Array.isArray(rec?.building_typologies)
        ? rec.building_typologies
        : [];
  const rows: {
    nome: string;
    areaM2: number | null;
    quartos: number | null;
    suites: number | null;
    banheiros: number | null;
    vagas: number | null;
    valor: number | null;
    pavimento: string | null;
  }[] = [];
  for (const item of list) {
    const row = asRecord(item);
    if (!row) continue;
    const nome =
      asString(row.name) ??
      asString(row.type) ??
      asString(row.typology) ??
      'Unidade';
    rows.push({
      nome,
      areaM2:
        asNumber(row.private_area) ??
        asNumber(row.area) ??
        asNumber(row.min_area),
      quartos: asInt(row.bedrooms) ?? asInt(row.bedroom),
      suites: asInt(row.suites) ?? asInt(row.suite),
      banheiros: asInt(row.bathrooms) ?? asInt(row.bathroom),
      vagas: asInt(row.parking) ?? asInt(row.parking_spaces),
      valor: asInt(row.price) ?? asInt(row.min_price),
      pavimento: asString(row.floor) ?? asString(row.pavement),
    });
  }
  return rows;
}

export function mapBuildingVitrine(
  building: Record<string, unknown>,
  extras: { plantas: string[]; tipologias: ReturnType<typeof extractTypologies> },
) {
  const address = asRecord(building.address) ?? {};
  const condoFeatures = featureNames(
    building.features ?? building.amenities ?? building.condominium_features,
  );
  const unitFeatures = featureNames(
    building.apartment_features ?? building.unit_features,
  );
  const minPrice =
    asInt(building.min_price) ?? asInt(building.min_price_brl);
  const maxPrice =
    asInt(building.max_price) ?? asInt(building.max_price_brl);
  const minArea = asNumber(building.min_area);
  const maxArea = asNumber(building.max_area);
  const valorM2 =
    minPrice != null && minArea
      ? Math.round(minPrice / minArea)
      : asNumber(building.price_per_m2);
  const launch =
    asString(building.launch_date) ?? asString(building.opening_date);
  const updated =
    asString(building.updated_at) ?? asString(building.updated_at_iso);

  return {
    descricao: asString(building.description),
    diferenciais: unitFeatures,
    lazer: condoFeatures,
    infraestrutura: [] as string[],
    detalhesUnidade: unitFeatures,
    numero: asString(address.number),
    bairro: asString(address.neighborhood),
    estado: asString(address.state),
    cep: asString(address.zip_code) ?? asString(address.zipcode),
    website: asString(building.website),
    tourVirtual:
      asString(building.virtual_tour) ??
      asString(asRecord(building.virtual_tour)?.url),
    lancamento: launch?.slice(0, 10) ?? null,
    unidades:
      asInt(building.number_of_units) ??
      asInt(building.stock) ??
      asInt(building.total_units),
    andares: asInt(building.number_of_floors) ?? asInt(building.floors),
    nomeCondominio:
      asString(building.condominium) ??
      asString(asRecord(building.condominium)?.name),
    suites: asInt(building.min_suites) ?? asInt(building.min_suite),
    areaMax: maxArea,
    valorMax: maxPrice,
    valorM2,
    latitude: asNumber(address.latitude) ?? asNumber(building.latitude),
    longitude: asNumber(address.longitude) ?? asNumber(building.longitude),
    atualizadoEm: updated?.slice(0, 10) ?? null,
    plantas: extras.plantas,
    tipologias: extras.tipologias,
    tiposUnidade: extras.tipologias
      .map((row) => row.nome)
      .filter((nome, index, list) => nome && list.indexOf(nome) === index),
  };
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
