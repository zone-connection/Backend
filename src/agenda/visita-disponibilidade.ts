/** Duração padrão quando a visita não tem horário de término. */
export const VISITA_DURACAO_PADRAO_MS = 60 * 60 * 1000;

/** Bloqueio preventivo quando o corretor informa só o início. */
export const VISITA_TOLERANCIA_MS = 2 * 60 * 60 * 1000;

export type JanelaVisita = { start: Date; end: Date };

export type RecursoVisita = {
  imovelId: string | null;
  empreendimentoId: string | null;
};

export function janelaVisita(input: {
  startsAt: Date;
  endsAt: Date | null;
  toleranciaAtiva: boolean;
}): JanelaVisita {
  const start = input.startsAt;
  if (input.toleranciaAtiva) {
    const toleranciaFim = new Date(start.getTime() + VISITA_TOLERANCIA_MS);
    const end =
      input.endsAt && input.endsAt.getTime() > toleranciaFim.getTime()
        ? input.endsAt
        : toleranciaFim;
    return { start, end };
  }
  return {
    start,
    end: input.endsAt ?? new Date(start.getTime() + VISITA_DURACAO_PADRAO_MS),
  };
}

export function janelasConflitam(a: JanelaVisita, b: JanelaVisita): boolean {
  return a.start.getTime() < b.end.getTime() && b.start.getTime() < a.end.getTime();
}

/**
 * O mesmo imóvel nunca divide horário.
 * Visita sem imóvel ocupa o empreendimento inteiro e cruza com qualquer
 * visita daquele empreendimento. Duas unidades diferentes do mesmo
 * empreendimento podem ser visitadas ao mesmo tempo.
 */
export function mesmoRecursoVisita(a: RecursoVisita, b: RecursoVisita): boolean {
  if (a.imovelId && b.imovelId && a.imovelId === b.imovelId) return true;
  if (!a.empreendimentoId || a.empreendimentoId !== b.empreendimentoId) {
    return false;
  }
  return !a.imovelId || !b.imovelId;
}
