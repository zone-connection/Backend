import {
  DAILY_FAILURE_WINDOW_MS,
  DAILY_LOCKOUT_DURATION_MS,
  DAILY_MAX_FAILED_LOGIN_ATTEMPTS,
  FAILED_LOGIN_WINDOW_MS,
  LOCKOUT_DURATION_MS,
  MAX_FAILED_LOGIN_ATTEMPTS,
} from '../config/security.constants';

/**
 * Minutos restantes de bloqueio, ou null se o e-mail pode tentar agora.
 * `failureTimes` são só falhas reais (não inclui tentativas já recusadas
 * por conta bloqueada).
 */
export function lockoutWaitMinutes(
  failureTimes: Date[],
  now = Date.now(),
): number | null {
  const times = failureTimes
    .map((time) => time.getTime())
    .filter((time) => time <= now)
    .sort((a, b) => a - b);

  let waitMs = 0;
  const dailyUntil = dailyLockUntil(times, now);
  if (dailyUntil !== null) waitMs = dailyUntil - now;

  const shortSince = now - FAILED_LOGIN_WINDOW_MS;
  let shortCount = 0;
  for (let i = times.length - 1; i >= 0; i -= 1) {
    if (times[i] < shortSince) break;
    shortCount += 1;
  }
  if (shortCount >= MAX_FAILED_LOGIN_ATTEMPTS) {
    waitMs = Math.max(waitMs, LOCKOUT_DURATION_MS);
  }

  if (waitMs <= 0) return null;
  return Math.max(1, Math.ceil(waitMs / 60_000));
}

export function formatLockoutWait(minutes: number): string {
  if (minutes >= 60) {
    const hours = Math.ceil(minutes / 60);
    return `${hours} ${hours === 1 ? 'hora' : 'horas'}`;
  }
  return `${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`;
}

/** Instante em que o bloqueio de 12 horas termina, se ainda estiver valendo. */
function dailyLockUntil(times: number[], now: number): number | null {
  const lookbackStart = now - DAILY_FAILURE_WINDOW_MS - DAILY_LOCKOUT_DURATION_MS;
  let lockUntil = 0;
  for (let i = 0; i < times.length; i += 1) {
    const at = times[i];
    if (at < lookbackStart) continue;
    const windowStart = at - DAILY_FAILURE_WINDOW_MS;
    let count = 0;
    for (let j = i; j >= 0; j -= 1) {
      if (times[j] < windowStart) break;
      count += 1;
    }
    if (count >= DAILY_MAX_FAILED_LOGIN_ATTEMPTS) {
      lockUntil = Math.max(lockUntil, at + DAILY_LOCKOUT_DURATION_MS);
    }
  }
  return lockUntil > now ? lockUntil : null;
}
