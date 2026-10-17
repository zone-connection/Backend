import { AtrasoLiberacaoDestino, Prisma } from '@prisma/client';

/**
 * Postgres trata NULL como desconhecido: `NOT (campo = retrabalho)`
 * esconderia a carteira atual (flag nula). Sempre incluir NULL.
 */
export const whereNotRetrabalho: Prisma.LeadWhereInput = {
  OR: [
    { origemAtrasoLiberacao: null },
    {
      origemAtrasoLiberacao: { not: AtrasoLiberacaoDestino.retrabalho },
    },
  ],
};
