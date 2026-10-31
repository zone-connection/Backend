import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { lembreteEstaPendente, ymdSaoPaulo } from './lembrete-recorrencia.util';

describe('lembreteEstaPendente', () => {
  const agora = new Date('2026-10-25T12:00:00.000-03:00');

  it('sempre volta a aparecer', () => {
    assert.equal(
      lembreteEstaPendente('sempre', new Date('2026-10-25T08:00:00.000-03:00'), agora),
      true,
    );
  });

  it('uma vez some depois de reconhecido', () => {
    assert.equal(lembreteEstaPendente('uma_vez', null, agora), true);
    assert.equal(
      lembreteEstaPendente('uma_vez', new Date('2026-10-20T12:00:00.000-03:00'), agora),
      false,
    );
  });

  it('diária só reaparece no dia seguinte', () => {
    assert.equal(
      lembreteEstaPendente('diaria', new Date('2026-10-25T08:00:00.000-03:00'), agora),
      false,
    );
    assert.equal(
      lembreteEstaPendente('diaria', new Date('2026-10-24T23:00:00.000-03:00'), agora),
      true,
    );
  });

  it('semanal reaparece depois de 7 dias', () => {
    assert.equal(
      lembreteEstaPendente('semanal', new Date('2026-10-20T12:00:00.000-03:00'), agora),
      false,
    );
    assert.equal(
      lembreteEstaPendente('semanal', new Date('2026-10-18T12:00:00.000-03:00'), agora),
      true,
    );
  });

  it('mensal reaparece em outro mês', () => {
    assert.equal(
      lembreteEstaPendente('mensal', new Date('2026-10-01T12:00:00.000-03:00'), agora),
      false,
    );
    assert.equal(
      lembreteEstaPendente('mensal', new Date('2026-09-30T12:00:00.000-03:00'), agora),
      true,
    );
  });

  it('formata a data de São Paulo', () => {
    assert.equal(ymdSaoPaulo(new Date('2026-10-25T02:30:00.000Z')), '2026-10-24');
  });
});
