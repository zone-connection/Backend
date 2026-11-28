import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { leadImpedeRedistribuicao } from './lead-redistribuicao.util';

describe('leadImpedeRedistribuicao', () => {
  it('bloqueia etapa de venda', () => {
    assert.equal(
      leadImpedeRedistribuicao({
        stage: 'venda',
        vendaSlugs: ['venda'],
      }),
      true,
    );
  });

  it('libera lead fora da etapa de venda', () => {
    assert.equal(
      leadImpedeRedistribuicao({
        stage: 'analise',
        vendaSlugs: ['venda'],
      }),
      false,
    );
  });
});
