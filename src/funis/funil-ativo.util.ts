import { FunilTipo, Prisma } from '@prisma/client';

/** Desativa apenas o funil ativo do mesmo tenant + tipo (não mexe em outros tipos). */
export function whereDeactivateActiveOfTipo(
  tenantId: string,
  tipo: FunilTipo,
  exceptId?: string,
): Prisma.FunilWhereInput {
  return {
    tenantId,
    tipo,
    ativo: true,
    ...(exceptId ? { NOT: { id: exceptId } } : {}),
  };
}

const COMMERCIAL_SLUGS = new Set([
  'novo',
  'em-analise',
  'ganho-venda',
  'visita-agendada',
  'visita-realizada',
  'contrato-fechamento',
]);

const OTHER_OP_SLUGS = new Set([
  'novo-proprietario',
  'captacao-perdida',
  'imovel-captado',
  'novo-interessado',
  'venda-usados',
  'perdido-usados',
]);

/** Funil legado de vendas (antes de Funil.tipo) vs seeds de captação/usados. */
export function looksLikeCommercialFunnel(
  etapas: Array<{ slug: string; label?: string }>,
): boolean {
  const slugs = etapas.map((e) => e.slug);
  if (slugs.some((s) => OTHER_OP_SLUGS.has(s))) return false;
  if (slugs.some((s) => COMMERCIAL_SLUGS.has(s))) return true;
  return etapas.some((e) => /novo lead/i.test((e.label ?? '').trim()));
}
