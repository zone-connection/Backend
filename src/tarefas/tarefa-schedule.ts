import {
  TarefaLembrete,
  TarefaRecorrencia,
} from '@prisma/client';

const OFFSET_MIN: Record<string, number> = {
  no_horario: 0,
  min_5: 5,
  min_15: 15,
  min_30: 30,
  hora_1: 60,
  dia_1: 24 * 60,
};

export function venceEmFrom(data: string, horario?: string | null): Date {
  const time = horario && /^\d{2}:\d{2}$/.test(horario) ? horario : '23:59';
  return new Date(`${data}T${time}:00-03:00`);
}

export function lembreteEmFrom(
  venceEm: Date,
  lembrete: TarefaLembrete,
  minutos?: number | null,
): Date | null {
  if (lembrete === TarefaLembrete.nenhum) return null;
  const offset =
    lembrete === TarefaLembrete.personalizado
      ? Math.max(0, minutos ?? 0)
      : (OFFSET_MIN[lembrete] ?? 0);
  return new Date(venceEm.getTime() - offset * 60_000);
}

function ymdInSaoPaulo(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function addDays(ymd: string, days: number): string {
  const base = new Date(`${ymd}T12:00:00-03:00`);
  base.setUTCDate(base.getUTCDate() + days);
  return ymdInSaoPaulo(base);
}

function addMonths(ymd: string, months: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + months, 1, 15));
  const last = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
  const day = Math.min(d, last);
  const out = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), day, 15));
  return ymdInSaoPaulo(out);
}

function weekday(ymd: string): number {
  const dt = new Date(`${ymd}T12:00:00-03:00`);
  return dt.getUTCDay();
}

export function nextData(input: {
  data: string;
  recorrencia: TarefaRecorrencia;
  diasSemana: number[];
  intervaloDias: number | null;
}): string | null {
  const { data, recorrencia, diasSemana, intervaloDias } = input;
  if (recorrencia === TarefaRecorrencia.nenhuma) return null;
  if (recorrencia === TarefaRecorrencia.diaria) return addDays(data, 1);
  if (recorrencia === TarefaRecorrencia.semanal) return addDays(data, 7);
  if (recorrencia === TarefaRecorrencia.mensal) return addMonths(data, 1);
  if (recorrencia === TarefaRecorrencia.personalizado) {
    return addDays(data, Math.max(1, intervaloDias ?? 1));
  }
  const days = [...new Set(diasSemana.filter((d) => d >= 0 && d <= 6))].sort();
  if (days.length === 0) return addDays(data, 7);
  const current = weekday(data);
  const ahead = days.find((d) => d > current);
  const delta = ahead !== undefined ? ahead - current : 7 - current + days[0];
  return addDays(data, delta);
}

export function todayYmd(now = new Date()): string {
  return ymdInSaoPaulo(now);
}
