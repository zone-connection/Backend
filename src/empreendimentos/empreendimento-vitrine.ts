export type EmpreendimentoTipologia = {
  nome: string;
  areaM2: number | null;
  quartos: number | null;
  suites: number | null;
  banheiros: number | null;
  vagas: number | null;
  valor: number | null;
  pavimento: string | null;
};

export type EmpreendimentoVitrine = {
  headline: string | null;
  descricao: string | null;
  diferenciais: string[];
  lazer: string[];
  infraestrutura: string[];
  detalhesUnidade: string[];
  numero: string | null;
  bairro: string | null;
  estado: string | null;
  cep: string | null;
  website: string | null;
  tourVirtual: string | null;
  lancamento: string | null;
  unidades: number | null;
  andares: number | null;
  nomeCondominio: string | null;
  suites: number | null;
  areaMax: number | null;
  valorMax: number | null;
  valorM2: number | null;
  latitude: number | null;
  longitude: number | null;
  atualizadoEm: string | null;
  plantas: string[];
  tipologias: EmpreendimentoTipologia[];
  tiposUnidade: string[];
};

const EMPTY: EmpreendimentoVitrine = {
  headline: null,
  descricao: null,
  diferenciais: [],
  lazer: [],
  infraestrutura: [],
  detalhesUnidade: [],
  numero: null,
  bairro: null,
  estado: null,
  cep: null,
  website: null,
  tourVirtual: null,
  lancamento: null,
  unidades: null,
  andares: null,
  nomeCondominio: null,
  suites: null,
  areaMax: null,
  valorMax: null,
  valorM2: null,
  latitude: null,
  longitude: null,
  atualizadoEm: null,
  plantas: [],
  tipologias: [],
  tiposUnidade: [],
};

function cleanText(value: unknown, max: number) {
  if (typeof value !== 'string') return null;
  const next = value.trim().slice(0, max);
  return next || null;
}

function cleanNum(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value.replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function cleanPlantas(value: unknown) {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const next: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string' || !/^https?:\/\//i.test(item)) continue;
    if (seen.has(item)) continue;
    seen.add(item);
    next.push(item);
    if (next.length >= 40) break;
  }
  return next;
}

function cleanTipologias(value: unknown): EmpreendimentoTipologia[] {
  if (!Array.isArray(value)) return [];
  const next: EmpreendimentoTipologia[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const nome = cleanText(row.nome, 80);
    const tipologia: EmpreendimentoTipologia = {
      nome: nome ?? 'Unidade',
      areaM2: cleanNum(row.areaM2),
      quartos: cleanNum(row.quartos) != null ? Math.round(cleanNum(row.quartos)!) : null,
      suites: cleanNum(row.suites) != null ? Math.round(cleanNum(row.suites)!) : null,
      banheiros: cleanNum(row.banheiros) != null ? Math.round(cleanNum(row.banheiros)!) : null,
      vagas: cleanNum(row.vagas) != null ? Math.round(cleanNum(row.vagas)!) : null,
      valor: cleanNum(row.valor) != null ? Math.round(cleanNum(row.valor)!) : null,
      pavimento: cleanText(row.pavimento, 40),
    };
    if (
      !nome &&
      tipologia.areaM2 == null &&
      tipologia.quartos == null &&
      tipologia.suites == null &&
      tipologia.banheiros == null &&
      tipologia.vagas == null &&
      tipologia.valor == null &&
      !tipologia.pavimento
    ) {
      continue;
    }
    next.push(tipologia);
    if (next.length >= 40) break;
  }
  return next;
}

function cleanList(value: unknown, maxItems: number, maxLen: number) {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const next: string[] = [];
  for (const item of value) {
    const label = typeof item === 'string' ? item.trim().slice(0, maxLen) : '';
    if (!label) continue;
    const key = label.toLocaleLowerCase('pt-BR');
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(label);
    if (next.length >= maxItems) break;
  }
  return next;
}

export function normalizeEmpreendimentoVitrine(
  raw: unknown,
): EmpreendimentoVitrine | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const data = raw as Record<string, unknown>;
  const next: EmpreendimentoVitrine = {
    headline: cleanText(data.headline, 120),
    descricao: cleanText(data.descricao, 8000),
    diferenciais: cleanList(data.diferenciais, 20, 160),
    lazer: cleanList(data.lazer, 40, 80),
    infraestrutura: cleanList(data.infraestrutura, 24, 80),
    detalhesUnidade: cleanList(data.detalhesUnidade, 40, 80),
    numero: cleanText(data.numero, 20),
    bairro: cleanText(data.bairro, 80),
    estado: cleanText(data.estado, 40),
    cep: cleanText(data.cep, 12),
    website: cleanText(data.website, 500),
    tourVirtual: cleanText(data.tourVirtual, 500),
    lancamento: cleanText(data.lancamento, 10),
    unidades: cleanNum(data.unidades) != null ? Math.round(cleanNum(data.unidades)!) : null,
    andares: cleanNum(data.andares) != null ? Math.round(cleanNum(data.andares)!) : null,
    nomeCondominio: cleanText(data.nomeCondominio, 160),
    suites: cleanNum(data.suites) != null ? Math.round(cleanNum(data.suites)!) : null,
    areaMax: cleanNum(data.areaMax),
    valorMax: cleanNum(data.valorMax) != null ? Math.round(cleanNum(data.valorMax)!) : null,
    valorM2: cleanNum(data.valorM2),
    latitude: cleanNum(data.latitude),
    longitude: cleanNum(data.longitude),
    atualizadoEm: cleanText(data.atualizadoEm, 40),
    plantas: cleanPlantas(data.plantas),
    tipologias: cleanTipologias(data.tipologias),
    tiposUnidade: cleanList(data.tiposUnidade, 24, 80),
  };
  applyTipologiasToVitrine(next);
  const empty =
    !next.headline &&
    !next.descricao &&
    next.diferenciais.length === 0 &&
    next.lazer.length === 0 &&
    next.infraestrutura.length === 0 &&
    next.detalhesUnidade.length === 0 &&
    !next.numero &&
    !next.bairro &&
    !next.estado &&
    !next.cep &&
    !next.website &&
    !next.tourVirtual &&
    !next.lancamento &&
    next.unidades == null &&
    next.andares == null &&
    !next.nomeCondominio &&
    next.suites == null &&
    next.areaMax == null &&
    next.valorMax == null &&
    next.valorM2 == null &&
    next.latitude == null &&
    next.longitude == null &&
    !next.atualizadoEm &&
    next.plantas.length === 0 &&
    next.tipologias.length === 0 &&
    next.tiposUnidade.length === 0;
  return empty ? null : next;
}

export type CatalogoTipologias = {
  areaM2: number | null;
  areaMax: number | null;
  quartos: number | null;
  suites: number | null;
  banheiros: number | null;
  vagas: number | null;
  valorReferencia: number | null;
  valorMax: number | null;
  tiposUnidade: string[];
};

function numbersOf(
  rows: EmpreendimentoTipologia[],
  pick: (row: EmpreendimentoTipologia) => number | null,
) {
  return rows
    .map(pick)
    .filter((value): value is number => value != null && Number.isFinite(value));
}

export function catalogoFromTipologias(
  tipologias: EmpreendimentoTipologia[],
): CatalogoTipologias {
  const areas = numbersOf(tipologias, (row) => row.areaM2);
  const valores = numbersOf(tipologias, (row) => row.valor);
  const quartos = numbersOf(tipologias, (row) => row.quartos);
  const suites = numbersOf(tipologias, (row) => row.suites);
  const banheiros = numbersOf(tipologias, (row) => row.banheiros);
  const vagas = numbersOf(tipologias, (row) => row.vagas);
  const tiposUnidade: string[] = [];
  const seen = new Set<string>();
  for (const row of tipologias) {
    const nome = row.nome.trim();
    if (!nome) continue;
    const key = nome.toLocaleLowerCase('pt-BR');
    if (seen.has(key)) continue;
    seen.add(key);
    tiposUnidade.push(nome);
  }
  return {
    areaM2: areas.length ? Math.min(...areas) : null,
    areaMax: areas.length ? Math.max(...areas) : null,
    quartos: quartos.length ? Math.min(...quartos) : null,
    suites: suites.length ? Math.min(...suites) : null,
    banheiros: banheiros.length ? Math.min(...banheiros) : null,
    vagas: vagas.length ? Math.min(...vagas) : null,
    valorReferencia: valores.length ? Math.min(...valores) : null,
    valorMax: valores.length ? Math.max(...valores) : null,
    tiposUnidade,
  };
}

function applyTipologiasToVitrine(vitrine: EmpreendimentoVitrine) {
  const catalogo = catalogoFromTipologias(vitrine.tipologias);
  if (catalogo.tiposUnidade.length) {
    vitrine.tiposUnidade = catalogo.tiposUnidade;
  }
  if (catalogo.suites != null) vitrine.suites = catalogo.suites;
  if (catalogo.areaMax != null) vitrine.areaMax = catalogo.areaMax;
  if (catalogo.valorMax != null) vitrine.valorMax = catalogo.valorMax;
}

export function emptyEmpreendimentoVitrine(): EmpreendimentoVitrine {
  return {
    ...EMPTY,
    diferenciais: [],
    lazer: [],
    infraestrutura: [],
    detalhesUnidade: [],
    plantas: [],
    tipologias: [],
    tiposUnidade: [],
  };
}
