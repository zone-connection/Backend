import { AtrasoLiberacaoDestino, Prisma } from '@prisma/client';

export function isOrigemRetrabalho(
  origem: AtrasoLiberacaoDestino | null | undefined,
): boolean {
  return origem === AtrasoLiberacaoDestino.retrabalho;
}

/** Ao sair do pool de retrabalho, a origem some — a tag precisa ir para a herdada. */
export function dadosAposRedistribuir(opts: {
  retrabalho: boolean;
  now?: Date;
  resetPrazo?: boolean;
}): Prisma.LeadUncheckedUpdateManyInput {
  const now = opts.now ?? new Date();
  return {
    origemAtrasoLiberacao: null,
    atrasoLiberadoAt: null,
    lastMovementAt: now,
    ...(opts.retrabalho
      ? {
          triagemOrigemHerdada: AtrasoLiberacaoDestino.retrabalho,
          lastTriagemAt: now,
        }
      : {}),
    ...(opts.resetPrazo
      ? { prazoDueAt: null, alertaProximoAt: null }
      : {}),
  };
}
