import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  janelaVisita,
  janelasConflitam,
  mesmoRecursoVisita,
  VISITA_TOLERANCIA_MS,
} from './visita-disponibilidade';

function at(iso: string) {
  return new Date(iso);
}

describe('janela da visita', () => {
  it('com tolerância ocupa duas horas a partir do início', () => {
    const start = at('2026-10-02T16:00:00.000Z');
    const janela = janelaVisita({
      startsAt: start,
      endsAt: null,
      toleranciaAtiva: true,
    });
    assert.equal(janela.end.getTime() - janela.start.getTime(), VISITA_TOLERANCIA_MS);
  });

  it('sem tolerância usa o término informado', () => {
    const start = at('2026-10-02T16:00:00.000Z');
    const end = at('2026-10-02T16:30:00.000Z');
    const janela = janelaVisita({
      startsAt: start,
      endsAt: end,
      toleranciaAtiva: false,
    });
    assert.equal(janela.end.toISOString(), end.toISOString());
  });

  it('tolerância não encolhe uma visita mais longa que duas horas', () => {
    const start = at('2026-10-02T16:00:00.000Z');
    const end = at('2026-10-02T20:00:00.000Z');
    const janela = janelaVisita({
      startsAt: start,
      endsAt: end,
      toleranciaAtiva: true,
    });
    assert.equal(janela.end.toISOString(), end.toISOString());
  });
});

describe('conflito de horário', () => {
  it('visita das 13h com tolerância impede outra às 14h30 no mesmo imóvel', () => {
    const ocupada = janelaVisita({
      startsAt: at('2026-10-02T16:00:00.000Z'),
      endsAt: null,
      toleranciaAtiva: true,
    });
    const pedido = janelaVisita({
      startsAt: at('2026-10-02T17:30:00.000Z'),
      endsAt: null,
      toleranciaAtiva: false,
    });
    assert.equal(janelasConflitam(ocupada, pedido), true);
  });

  it('libera o horário que começa exatamente quando a tolerância acaba', () => {
    const ocupada = janelaVisita({
      startsAt: at('2026-10-02T16:00:00.000Z'),
      endsAt: null,
      toleranciaAtiva: true,
    });
    const pedido = janelaVisita({
      startsAt: ocupada.end,
      endsAt: null,
      toleranciaAtiva: false,
    });
    assert.equal(janelasConflitam(ocupada, pedido), false);
  });
});

describe('recurso da visita', () => {
  it('duas unidades do mesmo empreendimento não se bloqueiam', () => {
    assert.equal(
      mesmoRecursoVisita(
        { imovelId: 'a', empreendimentoId: 'emp' },
        { imovelId: 'b', empreendimentoId: 'emp' },
      ),
      false,
    );
  });

  it('visita do empreendimento inteiro bloqueia a unidade', () => {
    assert.equal(
      mesmoRecursoVisita(
        { imovelId: null, empreendimentoId: 'emp' },
        { imovelId: 'a', empreendimentoId: 'emp' },
      ),
      true,
    );
  });

  it('o mesmo imóvel conflita mesmo sem empreendimento', () => {
    assert.equal(
      mesmoRecursoVisita(
        { imovelId: 'a', empreendimentoId: null },
        { imovelId: 'a', empreendimentoId: 'outro' },
      ),
      true,
    );
  });
});
