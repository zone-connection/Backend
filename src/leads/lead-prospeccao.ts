import { Prisma } from '@prisma/client';

/** Campos B2B do funil da Zone Connection (super tenant). */
export type LeadProspeccao = {
  endereco?: string | null;
  instagram?: string | null;
  site?: string | null;
  linkedin?: string | null;
  atuacao?: string | null;
  lancamentos?: string | null;
  usados?: string | null;
  locacao?: string | null;
  administracao?: string | null;
  crmIdentificado?: string | null;
  tecnologia?: string | null;
  sinais?: string | null;
  quemAbordar?: string | null;
  produtoIndicado?: string | null;
  fit?: number | null;
  motivoFit?: string | null;
};

const STRING_KEYS = [
  'endereco',
  'instagram',
  'site',
  'linkedin',
  'atuacao',
  'lancamentos',
  'usados',
  'locacao',
  'administracao',
  'crmIdentificado',
  'tecnologia',
  'sinais',
  'quemAbordar',
  'produtoIndicado',
  'motivoFit',
] as const;

function clip(value: unknown, max: number): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  return text.slice(0, max);
}

export function sanitizeProspeccao(
  raw: LeadProspeccao | Record<string, unknown> | null | undefined,
): Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return Prisma.JsonNull;

  const out: Record<string, string | number> = {};
  for (const key of STRING_KEYS) {
    const value = clip((raw as Record<string, unknown>)[key], 2000);
    if (value) out[key] = value;
  }
  const fitRaw = (raw as Record<string, unknown>).fit;
  if (fitRaw !== undefined && fitRaw !== null && fitRaw !== '') {
    const n = Number(fitRaw);
    if (Number.isFinite(n)) {
      out.fit = Math.min(10, Math.max(0, Math.round(n * 10) / 10));
    }
  }
  return Object.keys(out).length ? out : Prisma.JsonNull;
}
