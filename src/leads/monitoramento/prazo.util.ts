import { FunilEtapaPapel, PrazoUnidade } from '@prisma/client';

export const DEFAULT_INATIVIDADE_VALOR = 48;
export const DEFAULT_INATIVIDADE_UNIDADE: PrazoUnidade = PrazoUnidade.horas;
export const DEFAULT_ALERTA_PERCENT = 20;

export type PrazoConfig = {
  valor: number;
  unidade: PrazoUnidade;
};

export function prazoToMs(valor: number, unidade: PrazoUnidade): number {
  const n = Math.max(0, valor);
  switch (unidade) {
    case PrazoUnidade.minutos:
      return n * 60_000;
    case PrazoUnidade.horas:
      return n * 3_600_000;
    case PrazoUnidade.dias:
      return n * 86_400_000;
    default:
      return n * 3_600_000;
  }
}

export function addPrazo(from: Date, valor: number, unidade: PrazoUnidade): Date {
  return new Date(from.getTime() + prazoToMs(valor, unidade));
}

export function formatPrazoCurto(valor: number, unidade: PrazoUnidade): string {
  switch (unidade) {
    case PrazoUnidade.minutos:
      return `${valor}min`;
    case PrazoUnidade.horas:
      return `${valor}h`;
    case PrazoUnidade.dias:
      return valor === 1 ? '1 dia' : `${valor} dias`;
    default:
      return `${valor}h`;
  }
}

/** Rótulo compacto em pt-BR (ex.: "2d 3h", "45min", "1h 20min"). */
export function formatDurationPt(ms: number): string {
  const abs = Math.max(0, Math.round(ms));
  const totalMin = Math.floor(abs / 60_000);
  if (totalMin < 1) return 'menos de 1min';
  const days = Math.floor(totalMin / (60 * 24));
  const hours = Math.floor((totalMin % (60 * 24)) / 60);
  const minutes = totalMin % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 && days === 0) parts.push(`${minutes}min`);
  if (parts.length === 0) return 'menos de 1min';
  return parts.join(' ');
}

export function alertaProximoAt(
  enteredAt: Date,
  dueAt: Date,
  percent: number,
): Date {
  const pct = Math.min(90, Math.max(1, percent || DEFAULT_ALERTA_PERCENT));
  const duration = Math.max(0, dueAt.getTime() - enteredAt.getTime());
  const remaining = duration * (pct / 100);
  return new Date(dueAt.getTime() - remaining);
}

export function isEtapaTerminal(
  papel: FunilEtapaPapel | null | undefined,
): boolean {
  return papel === FunilEtapaPapel.venda || papel === FunilEtapaPapel.perdido;
}

export function fingerprintPrazo(enteredAt: Date, dueAt: Date): string {
  return `${enteredAt.toISOString()}|${dueAt.toISOString()}`;
}
