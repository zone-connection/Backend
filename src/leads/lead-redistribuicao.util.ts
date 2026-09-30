import { Prisma } from '@prisma/client';
import { isStatusVendido } from '../common/utils/documentacao-status';

export const LEAD_VENDA_OU_VGV_MESSAGE =
  'Lead com venda ou VGV não pode ser redistribuído.';

export function documentacaoImpedeRedistribuicao(doc: {
  vgv?: number | null;
  status2?: string | null;
}): boolean {
  return doc.vgv != null || isStatusVendido(doc.status2);
}

export function leadImpedeRedistribuicao(input: {
  stage: string;
  vendaSlugs: readonly string[];
  documentacoes: Array<{ vgv?: number | null; status2?: string | null }>;
}): boolean {
  if (input.vendaSlugs.includes(input.stage)) return true;
  return input.documentacoes.some(documentacaoImpedeRedistribuicao);
}

/** Exclui etapa Venda, ficha vendida e qualquer documentação com VGV. */
export function excludeVendaOuVgvWhere(
  vendaSlugs: readonly string[],
): Prisma.LeadWhereInput {
  const or: Prisma.LeadWhereInput[] = [
    {
      documentacoes: {
        some: {
            OR: [
              { vgv: { not: null } },
              { status2: { equals: 'venda', mode: 'insensitive' } },
              { status2: { startsWith: 'vendid', mode: 'insensitive' } },
            ],
        },
      },
    },
  ];
  if (vendaSlugs.length > 0) {
    or.unshift({ stage: { in: [...vendaSlugs] } });
  }
  return { NOT: { OR: or } };
}
