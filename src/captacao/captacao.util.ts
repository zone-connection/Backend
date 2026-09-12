import { PessoaTipo } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';

export type FunilEtapaResumo = {
  funilEtapaId: string;
  label: string;
  papel: string | null;
  color: string | null;
  sortOrder: number;
  total: number;
};

export function mergeFunilPorEtapa(
  etapas: Array<{
    id: string;
    label: string;
    papel: string | null;
    color: string | null;
    sortOrder: number;
  }>,
  counts: Array<{ funilEtapaId: string; _count: { _all: number } }>,
): FunilEtapaResumo[] {
  const countMap = new Map(
    counts.map((row) => [row.funilEtapaId, row._count._all]),
  );
  return etapas.map((etapa) => ({
    funilEtapaId: etapa.id,
    label: etapa.label,
    papel: etapa.papel,
    color: etapa.color,
    sortOrder: etapa.sortOrder,
    total: countMap.get(etapa.id) ?? 0,
  }));
}

export function pickFirstActiveEtapa<
  T extends { id: string; sortOrder: number; active: boolean },
>(etapas: T[]): T | null {
  const active = etapas
    .filter((e) => e.active)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  return active[0] ?? null;
}

export function toMoneyNumber(
  value: { toNumber?: () => number } | number | string | null | undefined,
): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const n = Number(value.replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  if (typeof value.toNumber === 'function') return value.toNumber();
  return Number(value);
}

export function moneyEqual(
  a: number | null | undefined,
  b: number | null | undefined,
): boolean {
  const left = a ?? null;
  const right = b ?? null;
  if (left == null && right == null) return true;
  if (left == null || right == null) return false;
  return Math.abs(left - right) < 0.005;
}

/** CPF (11) ou CNPJ (14), só dígitos. */
export function normalizeCpfCnpj(
  value: string | undefined | null,
  tipo: PessoaTipo = PessoaTipo.fisica,
): string {
  const max = tipo === PessoaTipo.juridica ? 14 : 11;
  return String(value ?? '')
    .replace(/\D/g, '')
    .slice(0, max);
}

export function assertCpfCnpj(digits: string, tipo: PessoaTipo): void {
  if (!digits) return;
  if (tipo === PessoaTipo.juridica && digits.length !== 14) {
    throw new BadRequestException('Informe um CNPJ com 14 dígitos.');
  }
  if (tipo === PessoaTipo.fisica && digits.length !== 11) {
    throw new BadRequestException('Informe um CPF com 11 dígitos.');
  }
}

const COMODIDADE_MAX = 40;
const COMODIDADE_LEN = 80;

/** Deduplica e limita tags de lazer/características. */
export function normalizeComodidades(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    if (typeof raw !== 'string') continue;
    const item = raw.trim().slice(0, COMODIDADE_LEN);
    if (!item) continue;
    const key = item.toLocaleLowerCase('pt-BR');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= COMODIDADE_MAX) break;
  }
  return out;
}
