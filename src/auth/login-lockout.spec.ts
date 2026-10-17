import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DAILY_LOCKOUT_DURATION_MS,
  FAILED_LOGIN_WINDOW_MS,
  LOCKOUT_DURATION_MS,
} from '../config/security.constants';
import { formatLockoutWait, lockoutWaitMinutes } from './login-lockout';

const minute = 60_000;

describe('lockoutWaitMinutes', () => {
  const now = Date.parse('2026-10-10T15:00:00.000Z');

  it('não bloqueia com poucas falhas recentes', () => {
    const times = [1, 2, 3, 4].map(
      (n) => new Date(now - n * minute),
    );
    assert.equal(lockoutWaitMinutes(times, now), null);
  });

  it('mantém o bloqueio de 15 minutos depois de 5 falhas', () => {
    const times = [1, 2, 3, 4, 5].map(
      (n) => new Date(now - n * minute),
    );
    const wait = lockoutWaitMinutes(times, now);
    assert.ok(wait !== null);
    assert.equal(wait, Math.ceil(LOCKOUT_DURATION_MS / minute));
    assert.ok(FAILED_LOGIN_WINDOW_MS > 5 * minute);
  });

  it('bloqueia por 12 horas na 15ª falha do dia', () => {
    const times = Array.from({ length: 15 }, (_, index) => {
      return new Date(now - (14 - index) * minute);
    });
    const wait = lockoutWaitMinutes(times, now);
    assert.equal(wait, Math.ceil(DAILY_LOCKOUT_DURATION_MS / minute));
  });

  it('libera depois que as 12 horas passam, mesmo com as falhas ainda no dia', () => {
    const trigger = now - DAILY_LOCKOUT_DURATION_MS - minute;
    const times = Array.from({ length: 15 }, (_, index) => {
      return new Date(trigger - (14 - index) * minute);
    });
    assert.equal(lockoutWaitMinutes(times, now), null);
  });
});

describe('formatLockoutWait', () => {
  it('fala em minutos ou horas', () => {
    assert.equal(formatLockoutWait(15), '15 minutos');
    assert.equal(formatLockoutWait(1), '1 minuto');
    assert.equal(formatLockoutWait(12 * 60), '12 horas');
    assert.equal(formatLockoutWait(60), '1 hora');
  });
});
