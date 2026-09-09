import { PrazoUnidade } from '@prisma/client';

export const MONITORAMENTO_FILTROS = [
  'todos',
  'sem_movimentacao',
  'proximo_vencimento',
  'em_atraso',
  'dentro_prazo',
] as const;

export type MonitoramentoFiltro = (typeof MONITORAMENTO_FILTROS)[number];

export type MonitoramentoVisual = 'none' | 'laranja' | 'vermelho';

export type MonitoramentoNivel =
  | 'normal'
  | 'proximo'
  | 'atrasado'
  | 'sem_movimentacao';

export type MotivoSemMovimentacao =
  | 'sem_status'
  | 'sem_triagem'
  | 'sem_atividade'
  | 'sem_tarefa';

export type ProblemaMonitoramento = {
  tipo:
    | 'prazo_ultrapassado'
    | 'sem_movimentacao'
    | 'prazo_proximo'
    | 'tarefa_atrasada';
  titulo: string;
  detalhe: string;
  motivos?: MotivoSemMovimentacao[];
};

export type TarefaAtrasadaResumo = {
  id: string;
  titulo: string;
  prazo: string;
  funilStage: string | null;
};

export type LeadMonitoramento = {
  nivel: MonitoramentoNivel;
  visual: MonitoramentoVisual;
  problemas: ProblemaMonitoramento[];
  stageEnteredAt: string | null;
  prazoDueAt: string | null;
  prazoConfigurado: { valor: number; unidade: PrazoUnidade } | null;
  prazoAdiado: boolean;
  lastMovementAt: string | null;
  lastStageChangeAt: string | null;
  lastTriagemAt: string | null;
  lastTarefaAt: string | null;
  lastAtividadeAt: string | null;
  permanenciaMs: number;
  permanenciaLabel: string;
  tempoRestanteMs: number | null;
  tempoRestanteLabel: string | null;
  tempoAtrasoMs: number | null;
  tempoAtrasoLabel: string | null;
  tempoSemMovimentacaoMs: number;
  tempoSemMovimentacaoLabel: string;
  inatividadeThresholdMs: number;
  inatividadeConfig: { valor: number; unidade: PrazoUnidade };
  podeAdiar: boolean;
  tarefasAtrasadas: TarefaAtrasadaResumo[];
};

export type LeadPrazoAdiamentoView = {
  id: string;
  autorNome: string;
  prazoAnteriorLabel: string;
  prazoNovoLabel: string;
  motivo: string | null;
  createdAt: string;
};

export type CorretorMonitoramentoLead = {
  id: string;
  nome: string;
  stage: string;
  problemas: ProblemaMonitoramento[];
  tarefasAtrasadas: TarefaAtrasadaResumo[];
};

export type CorretorMonitoramento = {
  id: string;
  name: string;
  totalAtrasos: number;
  semMovimentacao: number;
  foraDoPrazo: number;
  tarefasAtrasadas: number;
  leads: CorretorMonitoramentoLead[];
};
