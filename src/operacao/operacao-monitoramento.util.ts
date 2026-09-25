import { FunilEtapaPapel, PrazoUnidade } from '@prisma/client';
import {
  addPrazo,
  alertaProximoAt,
  DEFAULT_ALERTA_PERCENT,
  DEFAULT_INATIVIDADE_UNIDADE,
  DEFAULT_INATIVIDADE_VALOR,
  formatDurationPt,
  isEtapaTerminal,
  prazoToMs,
} from '../leads/monitoramento/prazo.util';
import type { LeadMonitoramento } from '../leads/monitoramento/lead-monitoramento.types';

export type OperacaoEtapaPrazo = {
  id?: string;
  papel?: FunilEtapaPapel | null;
  prazoValor?: number | null;
  prazoUnidade?: PrazoUnidade | null;
  alertaAntecedenciaPercent?: number | null;
};

export type OperacaoTimingInput = {
  createdAt: Date;
  stageEnteredAt?: Date | null;
  lastStageChangeAt?: Date | null;
  lastMovementAt?: Date | null;
  lastHistoricoAt?: Date | null;
  prazoDueAt?: Date | null;
  alertaProximoAt?: Date | null;
  prazoAdiado?: boolean;
  etapa: OperacaoEtapaPrazo | null;
  inatividadeValor?: number | null;
  inatividadeUnidade?: PrazoUnidade | null;
  idleTitle: string;
  now?: Date;
};

export function prazoFieldsForEtapa(
  enteredAt: Date,
  etapa: OperacaoEtapaPrazo | null,
) {
  if (
    !etapa ||
    isEtapaTerminal(etapa.papel) ||
    !etapa.prazoValor ||
    etapa.prazoValor <= 0
  ) {
    return { prazoDueAt: null, alertaProximoAt: null };
  }
  const due = addPrazo(
    enteredAt,
    etapa.prazoValor,
    etapa.prazoUnidade ?? 'horas',
  );
  return {
    prazoDueAt: due,
    alertaProximoAt: alertaProximoAt(
      enteredAt,
      due,
      etapa.alertaAntecedenciaPercent || DEFAULT_ALERTA_PERCENT,
    ),
  };
}

export function stageChangeTiming(now: Date, etapa: OperacaoEtapaPrazo | null) {
  return {
    stageEnteredAt: now,
    lastStageChangeAt: now,
    lastMovementAt: now,
    lastHistoricoAt: now,
    prazoAdiado: false,
    ...prazoFieldsForEtapa(now, etapa),
  };
}

export function followUpTiming(now: Date, etapa: OperacaoEtapaPrazo | null) {
  return {
    lastMovementAt: now,
    lastHistoricoAt: now,
    prazoAdiado: false,
    ...prazoFieldsForEtapa(now, etapa),
  };
}

export function computeOperacaoMonitoramento(
  input: OperacaoTimingInput,
): LeadMonitoramento {
  const now = input.now ?? new Date();
  const etapa = input.etapa;
  const terminal = isEtapaTerminal(etapa?.papel);
  const enteredAt = input.stageEnteredAt ?? input.createdAt;
  const lastMovementAt =
    input.lastMovementAt ?? input.lastHistoricoAt ?? input.createdAt;
  const slaStart =
    lastMovementAt.getTime() > enteredAt.getTime()
      ? lastMovementAt
      : enteredAt;
  const computed = prazoFieldsForEtapa(slaStart, etapa);
  const computedDue = computed.prazoDueAt ?? input.prazoDueAt ?? null;
  const adiadoDue =
    input.prazoAdiado && input.prazoDueAt ? input.prazoDueAt : null;
  const dueAt =
    adiadoDue &&
    computedDue &&
    adiadoDue.getTime() > computedDue.getTime()
      ? adiadoDue
      : computedDue;
  const nearAt =
    dueAt === adiadoDue
      ? (input.alertaProximoAt ?? computed.alertaProximoAt)
      : (computed.alertaProximoAt ?? input.alertaProximoAt);

  const inatividadeValor =
    input.inatividadeValor ?? DEFAULT_INATIVIDADE_VALOR;
  const inatividadeUnidade =
    input.inatividadeUnidade ?? DEFAULT_INATIVIDADE_UNIDADE;
  const inatividadeMs = prazoToMs(inatividadeValor, inatividadeUnidade);

  const permanenciaMs = Math.max(0, now.getTime() - enteredAt.getTime());
  const idleMs = Math.max(0, now.getTime() - lastMovementAt.getTime());
  const problemas: LeadMonitoramento['problemas'] = [];

  if (!terminal && dueAt && dueAt.getTime() < now.getTime()) {
    const atraso = now.getTime() - dueAt.getTime();
    problemas.push({
      tipo: 'prazo_ultrapassado',
      titulo: 'Prazo da etapa ultrapassado',
      detalhe: `Atrasado há ${formatDurationPt(atraso)}.`,
    });
  }

  if (!terminal && inatividadeMs > 0 && idleMs >= inatividadeMs) {
    const cutoff = now.getTime() - inatividadeMs;
    const stale = (d: Date | null | undefined) =>
      !d || d.getTime() < cutoff;
    const motivos: LeadMonitoramento['problemas'][number]['motivos'] = [];
    if (stale(input.lastStageChangeAt)) motivos.push('sem_status');
    if (stale(input.lastHistoricoAt)) motivos.push('sem_triagem');
    problemas.push({
      tipo: 'sem_movimentacao',
      titulo: input.idleTitle,
      detalhe: `Sem movimentação há ${formatDurationPt(idleMs)}.`,
      motivos,
    });
  }

  if (
    !terminal &&
    dueAt &&
    dueAt.getTime() >= now.getTime() &&
    nearAt &&
    nearAt.getTime() <= now.getTime()
  ) {
    const restante = dueAt.getTime() - now.getTime();
    problemas.push({
      tipo: 'prazo_proximo',
      titulo: 'Prazo próximo do vencimento',
      detalhe: `Restam ${formatDurationPt(restante)} para o prazo da etapa.`,
    });
  }

  const hasOverdue = problemas.some((p) => p.tipo === 'prazo_ultrapassado');
  const hasIdle = problemas.some((p) => p.tipo === 'sem_movimentacao');
  const hasNear = problemas.some((p) => p.tipo === 'prazo_proximo');

  let nivel: LeadMonitoramento['nivel'] = 'normal';
  let visual: LeadMonitoramento['visual'] = 'none';
  if (hasOverdue) {
    nivel = 'atrasado';
    visual = 'vermelho';
  } else if (hasIdle) {
    nivel = 'sem_movimentacao';
    visual = 'vermelho';
  } else if (hasNear) {
    nivel = 'proximo';
    visual = 'laranja';
  }

  const tempoAtrasoMs =
    dueAt && dueAt.getTime() < now.getTime()
      ? now.getTime() - dueAt.getTime()
      : null;
  const tempoRestanteMs =
    dueAt && dueAt.getTime() >= now.getTime()
      ? dueAt.getTime() - now.getTime()
      : null;

  return {
    nivel,
    visual,
    problemas,
    stageEnteredAt: enteredAt.toISOString(),
    prazoDueAt: dueAt ? dueAt.toISOString() : null,
    prazoConfigurado:
      etapa?.prazoValor && !isEtapaTerminal(etapa.papel)
        ? {
            valor: etapa.prazoValor,
            unidade: etapa.prazoUnidade ?? 'horas',
          }
        : null,
    prazoAdiado: Boolean(input.prazoAdiado),
    lastMovementAt: lastMovementAt.toISOString(),
    lastStageChangeAt: input.lastStageChangeAt?.toISOString() ?? null,
    lastTriagemAt: input.lastHistoricoAt?.toISOString() ?? null,
    lastTarefaAt: null,
    lastAtividadeAt: null,
    permanenciaMs,
    permanenciaLabel: formatDurationPt(permanenciaMs),
    tempoRestanteMs,
    tempoRestanteLabel: tempoRestanteMs
      ? formatDurationPt(tempoRestanteMs)
      : null,
    tempoAtrasoMs,
    tempoAtrasoLabel: tempoAtrasoMs ? formatDurationPt(tempoAtrasoMs) : null,
    tempoSemMovimentacaoMs: idleMs,
    tempoSemMovimentacaoLabel: formatDurationPt(idleMs),
    inatividadeThresholdMs: inatividadeMs,
    inatividadeConfig: {
      valor: inatividadeValor,
      unidade: inatividadeUnidade,
    },
    podeAdiar: false,
    tarefasAtrasadas: [],
  };
}
