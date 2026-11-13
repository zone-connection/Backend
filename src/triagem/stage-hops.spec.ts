import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  forwardStageHops,
  hopAutoTexto,
  isAutoAvancoTexto,
} from './stage-hops';

const stages = [
  { slug: 'novo', label: 'Novo lead' },
  { slug: 'qualificacao', label: 'Qualificação' },
  { slug: 'analise', label: 'Em análise' },
  { slug: 'visita', label: 'Visita agendada' },
];

describe('forwardStageHops', () => {
  it('expande cada etapa pulada ao avançar', () => {
    assert.deepEqual(forwardStageHops(stages, 'novo', 'analise'), [
      {
        fromSlug: 'novo',
        fromLabel: 'Novo lead',
        toSlug: 'qualificacao',
        toLabel: 'Qualificação',
      },
      {
        fromSlug: 'qualificacao',
        fromLabel: 'Qualificação',
        toSlug: 'analise',
        toLabel: 'Em análise',
      },
    ]);
  });

  it('mantém um único salto quando não há etapas no meio', () => {
    assert.equal(forwardStageHops(stages, 'novo', 'qualificacao').length, 1);
  });

  it('não inventa caminho no recuo', () => {
    assert.deepEqual(forwardStageHops(stages, 'analise', 'novo'), [
      {
        fromSlug: 'analise',
        fromLabel: 'Em análise',
        toSlug: 'novo',
        toLabel: 'Novo lead',
      },
    ]);
  });
});

describe('hopAutoTexto', () => {
  it('gera o relato automático por salto', () => {
    const hop = forwardStageHops(stages, 'novo', 'qualificacao')[0];
    assert.equal(
      hopAutoTexto(hop),
      'Etapa avançada de "Novo lead" para "Qualificação".',
    );
    assert.equal(isAutoAvancoTexto(hopAutoTexto(hop)), true);
  });
});
