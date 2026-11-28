import { LeadAtribuicaoAcao, Prisma, TriagemOrigem } from '@prisma/client';

export type AtribuicaoRegistro = {
  tenantId: string;
  leadId: string;
  acao: LeadAtribuicaoAcao;
  actorId?: string | null;
  fromCorretorId?: string | null;
  toCorretorId?: string | null;
  fromEquipeId?: string | null;
  toEquipeId?: string | null;
  origem?: TriagemOrigem;
};

type Writer = {
  leadReatribuicao: {
    createMany: (args: {
      data: Prisma.LeadReatribuicaoCreateManyInput[];
    }) => Promise<unknown>;
  };
};

export function acaoDistribuicao(
  antes: { corretorId: string | null; equipeId: string | null },
  toCorretorId: string | null,
  toEquipeId: string | null,
): LeadAtribuicaoAcao {
  const trocouEquipe = (antes.equipeId ?? null) !== (toEquipeId ?? null);
  const trocouCorretor = (antes.corretorId ?? null) !== (toCorretorId ?? null);
  if (trocouEquipe && !trocouCorretor) return LeadAtribuicaoAcao.troca_equipe;
  return LeadAtribuicaoAcao.distribuicao;
}

export async function registrarAtribuicoes(
  db: Writer,
  rows: AtribuicaoRegistro[],
) {
  const data = rows.filter((row) => row.leadId);
  if (data.length === 0) return;
  await db.leadReatribuicao.createMany({
    data: data.map((row) => ({
      tenantId: row.tenantId,
      leadId: row.leadId,
      acao: row.acao,
      actorId: row.actorId ?? null,
      fromCorretorId: row.fromCorretorId ?? null,
      toCorretorId: row.toCorretorId ?? null,
      fromEquipeId: row.fromEquipeId ?? null,
      toEquipeId: row.toEquipeId ?? null,
      origem: row.origem ?? TriagemOrigem.manual,
    })),
  });
}
