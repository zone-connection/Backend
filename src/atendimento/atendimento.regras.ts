export type EtapaCadencia = {
  id: string;
  ordem: number;
  dia: number;
  acao: string;
  descricao: string;
};

export type ExecucaoCadencia = {
  etapaId: string | null;
  dia: number;
  acao: string;
  concluidaEm: string;
};

export type ItemChecklist = {
  id: string;
  modeloId: string;
  texto: string;
  obrigatorio: boolean;
  ordem: number;
};

export function statusCadencia(
  etapa: EtapaCadencia,
  inicio: Date,
  execucao: ExecucaoCadencia | undefined,
  agora: Date,
) {
  if (execucao) {
    return {
      status: 'concluida' as const,
      previstaPara: prevista(inicio, etapa.dia).toISOString(),
      concluidaEm: execucao.concluidaEm,
    };
  }
  const prazo = prevista(inicio, etapa.dia);
  return {
    status: agora.getTime() > prazo.getTime() ? ('atrasada' as const) : ('pendente' as const),
    previstaPara: prazo.toISOString(),
    concluidaEm: null,
  };
}

function prevista(inicio: Date, dia: number) {
  const data = new Date(inicio.getTime());
  data.setDate(data.getDate() + Math.max(0, dia - 1));
  data.setHours(23, 59, 59, 999);
  return data;
}

export function checklistCompleto(
  itens: ItemChecklist[],
  marcados: Set<string>,
) {
  if (itens.length === 0) return false;
  const obrigatorios = itens.filter((item) => item.obrigatorio);
  const alvo = obrigatorios.length > 0 ? obrigatorios : itens;
  return alvo.every((item) => marcados.has(item.id));
}
