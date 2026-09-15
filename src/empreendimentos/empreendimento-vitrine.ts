export type EmpreendimentoVitrine = {
  headline: string | null;
  descricao: string | null;
  diferenciais: string[];
  lazer: string[];
  numero: string | null;
  bairro: string | null;
  estado: string | null;
  cep: string | null;
};

const EMPTY: EmpreendimentoVitrine = {
  headline: null,
  descricao: null,
  diferenciais: [],
  lazer: [],
  numero: null,
  bairro: null,
  estado: null,
  cep: null,
};

function cleanText(value: unknown, max: number) {
  if (typeof value !== 'string') return null;
  const next = value.trim().slice(0, max);
  return next || null;
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
    lazer: cleanList(data.lazer, 24, 80),
    numero: cleanText(data.numero, 20),
    bairro: cleanText(data.bairro, 80),
    estado: cleanText(data.estado, 40),
    cep: cleanText(data.cep, 12),
  };
  const empty =
    !next.headline &&
    !next.descricao &&
    next.diferenciais.length === 0 &&
    next.lazer.length === 0 &&
    !next.numero &&
    !next.bairro &&
    !next.estado &&
    !next.cep;
  return empty ? null : next;
}

export function emptyEmpreendimentoVitrine(): EmpreendimentoVitrine {
  return { ...EMPTY, diferenciais: [], lazer: [] };
}
