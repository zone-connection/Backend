import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FunilEtapaPapel } from '@prisma/client';
import { resolveEtapaPapel } from './funil-etapa-papel.util';

describe('resolveEtapaPapel', () => {
  it('usa o papel gravado quando existe', () => {
    assert.equal(
      resolveEtapaPapel({
        id: '1',
        slug: 'novo',
        papel: FunilEtapaPapel.analise,
      }),
      FunilEtapaPapel.analise,
    );
  });

  it('faz fallback por slug legado quando ninguém mais tem o papel', () => {
    assert.equal(
      resolveEtapaPapel({ id: '1', slug: 'novo', papel: null }, [
        { id: '2', papel: null },
      ]),
      FunilEtapaPapel.inicial,
    );
  });

  it('não reaplica fallback quando outra etapa já tem o papel', () => {
    assert.equal(
      resolveEtapaPapel({ id: '1', slug: 'novo', papel: null }, [
        { id: '2', papel: FunilEtapaPapel.inicial },
      ]),
      null,
    );
  });

  it('permite mover Venda para outra etapa sem manter ganho-venda', () => {
    const etapas = [
      { id: '1', slug: 'ganho-venda', papel: null as FunilEtapaPapel | null },
      { id: '2', slug: 'fechamento', papel: FunilEtapaPapel.venda },
    ];
    assert.equal(resolveEtapaPapel(etapas[0], etapas), null);
    assert.equal(
      resolveEtapaPapel(etapas[1], etapas),
      FunilEtapaPapel.venda,
    );
  });
});
