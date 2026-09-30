import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  documentacaoImpedeRedistribuicao,
  leadImpedeRedistribuicao,
} from './lead-redistribuicao.util';

describe('leadImpedeRedistribuicao', () => {
  it('bloqueia etapa de venda', () => {
    assert.equal(
      leadImpedeRedistribuicao({
        stage: 'venda',
        vendaSlugs: ['venda'],
        documentacoes: [],
      }),
      true,
    );
  });

  it('bloqueia VGV preenchido fora da etapa de venda', () => {
    assert.equal(
      leadImpedeRedistribuicao({
        stage: 'analise',
        vendaSlugs: ['venda'],
        documentacoes: [{ vgv: 320000, status2: 'Andamento' }],
      }),
      true,
    );
  });

  it('bloqueia ficha vendida mesmo sem VGV', () => {
    assert.equal(
      documentacaoImpedeRedistribuicao({ vgv: null, status2: 'Vendido' }),
      true,
    );
  });

  it('libera lead sem venda e sem VGV', () => {
    assert.equal(
      leadImpedeRedistribuicao({
        stage: 'analise',
        vendaSlugs: ['venda'],
        documentacoes: [{ vgv: null, status2: 'Andamento' }],
      }),
      false,
    );
  });
});
