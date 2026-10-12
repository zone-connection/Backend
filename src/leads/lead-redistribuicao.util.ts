import { Prisma } from '@prisma/client';

export const LEAD_VENDA_OU_VGV_MESSAGE =
  'Lead na etapa de venda não pode ser redistribuído.';

/** A etapa de venda do funil bloqueia. A ficha de documentação não entra nessa conta. */
export function leadImpedeRedistribuicao(input: {
  stage: string;
  vendaSlugs: readonly string[];
}): boolean {
  return input.vendaSlugs.includes(input.stage);
}

/** Exclui quem já está na etapa Venda do funil. */
export function excludeVendaOuVgvWhere(
  vendaSlugs: readonly string[],
): Prisma.LeadWhereInput {
  if (vendaSlugs.length === 0) return {};
  return { NOT: { stage: { in: [...vendaSlugs] } } };
}
