import { Prisma } from '@prisma/client';

/** Fichas sintéticas criadas ao lançar comissão de cliente fora do CRM. */
export const DOCUMENTACAO_FONTE_COMISSAO = 'Comissão';

/** Lista operacional: esconde documentação gerada só para comissão. */
export function documentacaoOperacionalWhere(): Prisma.DocumentacaoWhereInput {
  return {
    NOT: {
      OR: [
        {
          fonte: {
            equals: DOCUMENTACAO_FONTE_COMISSAO,
            mode: 'insensitive',
          },
        },
        {
          lead: {
            origem: {
              equals: DOCUMENTACAO_FONTE_COMISSAO,
              mode: 'insensitive',
            },
          },
        },
      ],
    },
  };
}

/** Remove acentos, caixa e caracteres não alfanuméricos. */
export function normalizeDocStatus(
  status: string | null | undefined,
): string {
  if (!status) return '';
  return status
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

export type DocStatus1Group =
  | 'aprovado'
  | 'reprovado'
  | 'pre_analise'
  | 'analise';
export type DocStatus2Group = 'vendido' | 'andamento' | 'bacen';

/** Agrupa variantes de Status 1 (ex.: ANALISE / em analise). */
export function status1Group(
  status: string | null | undefined,
): DocStatus1Group | null {
  const n = normalizeDocStatus(status);
  if (!n) return null;
  if (n.startsWith('reprov')) return 'reprovado';
  // Não agrupa "Aprovado c/ restrição" com "Aprovado"
  if (
    n === 'aprovado' ||
    n === 'aprovada' ||
    n === 'aprovados' ||
    n === 'aprovadas'
  ) {
    return 'aprovado';
  }
  // Antes de "analise": "preanalise" contém a substring "analise".
  if (
    n.startsWith('preanalise') ||
    n.includes('preanalise') ||
    n === 'preanalise'
  ) {
    return 'pre_analise';
  }
  if (n.includes('analise')) return 'analise';
  return null;
}

/** Agrupa variantes de Status 2 (ex.: VENDIDO / venda). */
export function status2Group(
  status: string | null | undefined,
): DocStatus2Group | null {
  const n = normalizeDocStatus(status);
  if (!n) return null;
  if (
    n === 'vendido' ||
    n === 'venda' ||
    n === 'vendidos' ||
    n === 'vendida' ||
    n === 'vendidas' ||
    n.startsWith('vendid')
  ) {
    return 'vendido';
  }
  if (n.includes('andamento')) return 'andamento';
  if (n.includes('bacen')) return 'bacen';
  return null;
}

export function isStatusVendido(
  status: string | null | undefined,
): boolean {
  return status2Group(status) === 'vendido';
}

export function isStatusAnalise(
  status: string | null | undefined,
): boolean {
  const g = status1Group(status);
  return g === 'analise' || g === 'pre_analise';
}

export function isStatusPreAnalise(
  status: string | null | undefined,
): boolean {
  return status1Group(status) === 'pre_analise';
}

/** Parecer final do Status 1 (aprovado ou reprovado) — já saiu da fila. */
export function isStatusParecerFinal(
  status: string | null | undefined,
): boolean {
  const g = status1Group(status);
  return g === 'aprovado' || g === 'reprovado';
}

export function isStatusReprovado(
  status: string | null | undefined,
): boolean {
  return status1Group(status) === 'reprovado';
}

export function isStatusAprovado(
  status: string | null | undefined,
): boolean {
  return status1Group(status) === 'aprovado';
}

/** Compara status considerando variantes semânticas. */
export function statusesMatch(a: string, b: string): boolean {
  const na = normalizeDocStatus(a);
  const nb = normalizeDocStatus(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const g1a = status1Group(a);
  const g1b = status1Group(b);
  if (g1a && g1b && g1a === g1b) return true;
  const g2a = status2Group(a);
  const g2b = status2Group(b);
  if (g2a && g2b && g2a === g2b) return true;
  return false;
}

export function canonicalizeStatus1(status: string): string {
  const g = status1Group(status);
  if (g === 'aprovado') return 'Aprovado';
  if (g === 'reprovado') return 'Reprovado';
  if (g === 'pre_analise') return 'Pré-análise';
  if (g === 'analise') return 'Em análise';
  return status.trim();
}

export function canonicalizeStatus2(status: string): string {
  const g = status2Group(status);
  if (g === 'vendido') return 'Vendido';
  if (g === 'andamento') return 'Andamento';
  if (g === 'bacen') return 'Bacen';
  return status.trim();
}

/**
 * Pipeline Status 1: Aprovado (inclui c/ restrição), Reprovado, Em análise.
 */
export function documentacaoPipelineStatusKey(
  status: string,
): 'aprovadas' | 'reprovadas' | 'emAnalise' | null {
  const normalized = status
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (normalized.startsWith('reprov')) return 'reprovadas';
  if (normalized.startsWith('aprov')) return 'aprovadas';
  if (normalized.includes('analise')) return 'emAnalise';
  return null;
}

/** Filtro Prisma que cobre grafias comuns de "vendido". */
export function status2VendidoWhere(): Prisma.DocumentacaoWhereInput {
  return {
    OR: [
      { status2: { startsWith: 'vend', mode: 'insensitive' } },
      { status2: { contains: 'vendido', mode: 'insensitive' } },
      { status2: { equals: 'venda', mode: 'insensitive' } },
    ],
  };
}

/**
 * Documentações cuja venda cai no período.
 * Usa dataVenda quando existe; se estiver vazia, usa createdAt
 * (evita VGV zerado em imports sem data de venda e evita contar a mesma
 * ficha em dois meses quando as datas divergem).
 */
export function documentacaoVendaNoPeriodoWhere(periodo: {
  inicio: Date;
  fim: Date;
}): Prisma.DocumentacaoWhereInput {
  return {
    OR: [
      { dataVenda: { gte: periodo.inicio, lt: periodo.fim } },
      {
        AND: [
          { dataVenda: null },
          { createdAt: { gte: periodo.inicio, lt: periodo.fim } },
        ],
      },
    ],
  };
}

export function sumVgvVendido(
  rows: Array<{ status2: string; _sum: { vgv: number | null } }>,
): number {
  return rows
    .filter((row) => isStatusVendido(row.status2))
    .reduce((total, row) => total + (row._sum.vgv ?? 0), 0);
}

export function countStatusVendido(
  rows: Array<{ status2: string; _count: { _all: number } }>,
): number {
  return rows
    .filter((row) => isStatusVendido(row.status2))
    .reduce((total, row) => total + row._count._all, 0);
}

export function countStatusAndamento(
  rows: Array<{ status2: string; _count: { _all: number } }>,
): number {
  return rows
    .filter((row) => status2Group(row.status2) === 'andamento')
    .reduce((total, row) => total + row._count._all, 0);
}
