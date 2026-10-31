export type LembreteRecorrencia =
  | 'sempre'
  | 'diaria'
  | 'semanal'
  | 'mensal'
  | 'uma_vez';

const SAO_PAULO = 'America/Sao_Paulo';

/** Data civil YYYY-MM-DD no fuso do CRM. */
export function ymdSaoPaulo(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: SAO_PAULO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function daysBetweenYmd(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  const a = Date.UTC(fy, fm - 1, fd);
  const b = Date.UTC(ty, tm - 1, td);
  return Math.round((b - a) / 86_400_000);
}

export function lembreteEstaPendente(
  recorrencia: LembreteRecorrencia,
  reconhecidoEm: Date | null | undefined,
  agora: Date = new Date(),
): boolean {
  if (recorrencia === 'sempre') return true;
  if (!reconhecidoEm) return true;

  const hoje = ymdSaoPaulo(agora);
  const ultimo = ymdSaoPaulo(reconhecidoEm);

  if (recorrencia === 'uma_vez') return false;
  if (recorrencia === 'diaria') return ultimo < hoje;
  if (recorrencia === 'semanal') return daysBetweenYmd(ultimo, hoje) >= 7;
  if (recorrencia === 'mensal') return ultimo.slice(0, 7) !== hoje.slice(0, 7);
  return true;
}
