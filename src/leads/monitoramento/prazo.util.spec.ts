import assert from 'node:assert/strict';
import test from 'node:test';
import { PrazoUnidade } from '@prisma/client';
import { atrasoStartedAtMs, atrasoElegivelParaLiberacao, prazoToMs } from './prazo.util';

test('atrasoStartedAtMs: null se a etapa é terminal', () => {
  const now = Date.parse('2026-09-12T12:00:00.000Z');
  const started = atrasoStartedAtMs({
    nowMs: now,
    terminal: true,
    prazoDueAt: new Date(now - 3_600_000),
    lastMovementAt: new Date(now - 10 * 3_600_000),
    inatividadeMs: prazoToMs(1, PrazoUnidade.horas),
  });
  assert.equal(started, null);
});

test('atrasoStartedAtMs: usa o vencimento do SLA quando já passou', () => {
  const now = Date.parse('2026-09-12T12:00:00.000Z');
  const due = new Date(now - 2 * 3_600_000);
  const started = atrasoStartedAtMs({
    nowMs: now,
    terminal: false,
    prazoDueAt: due,
    lastMovementAt: new Date(now - 30 * 60_000),
    inatividadeMs: prazoToMs(48, PrazoUnidade.horas),
  });
  assert.equal(started, due.getTime());
});

test('atrasoStartedAtMs: inatividade conta a partir do fim da janela', () => {
  const now = Date.parse('2026-09-12T12:00:00.000Z');
  const last = new Date(now - 50 * 3_600_000);
  const inatividadeMs = prazoToMs(48, PrazoUnidade.horas);
  const started = atrasoStartedAtMs({
    nowMs: now,
    terminal: false,
    prazoDueAt: null,
    lastMovementAt: last,
    inatividadeMs,
  });
  assert.equal(started, last.getTime() + inatividadeMs);
});

test('atrasoStartedAtMs: pega o atraso que começou primeiro', () => {
  const now = Date.parse('2026-09-12T12:00:00.000Z');
  const due = new Date(now - 1 * 3_600_000);
  const last = new Date(now - 50 * 3_600_000);
  const inatividadeMs = prazoToMs(48, PrazoUnidade.horas);
  const started = atrasoStartedAtMs({
    nowMs: now,
    terminal: false,
    prazoDueAt: due,
    lastMovementAt: last,
    inatividadeMs,
  });
  assert.equal(started, last.getTime() + inatividadeMs);
});

test('atrasoElegivelParaLiberacao: redistribuido agora nao volta pelo SLA antigo', () => {
  const now = Date.parse('2026-09-12T12:00:00.000Z');
  const due = new Date(now - 10 * 3_600_000);
  const last = new Date(now - 60_000);
  const ok = atrasoElegivelParaLiberacao({
    nowMs: now,
    terminal: false,
    prazoDueAt: due,
    lastMovementAt: last,
    inatividadeMs: prazoToMs(48, PrazoUnidade.horas),
    delayMs: prazoToMs(1, PrazoUnidade.horas),
  });
  assert.equal(ok, false);
});

test('atrasoElegivelParaLiberacao: atraso continua apos o delay desde o ultimo movimento', () => {
  const now = Date.parse('2026-09-12T12:00:00.000Z');
  const last = new Date(now - 5 * 3_600_000);
  const due = new Date(now - 4 * 3_600_000);
  const ok = atrasoElegivelParaLiberacao({
    nowMs: now,
    terminal: false,
    prazoDueAt: due,
    lastMovementAt: last,
    inatividadeMs: prazoToMs(48, PrazoUnidade.horas),
    delayMs: prazoToMs(1, PrazoUnidade.horas),
  });
  assert.equal(ok, true);
});
