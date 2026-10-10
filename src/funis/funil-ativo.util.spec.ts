import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FunilTipo } from '@prisma/client';
import {
  looksLikeCommercialFunnel,
  whereDeactivateActiveOfTipo,
} from './funil-ativo.util';

describe('looksLikeCommercialFunnel', () => {
  it('reconhece o funil de vendas legado', () => {
    assert.equal(
      looksLikeCommercialFunnel([
        { slug: 'novo', label: 'Novo lead' },
        { slug: 'em-analise' },
      ]),
      true,
    );
  });

  it('não classifica o seed de captação como comercial', () => {
    assert.equal(
      looksLikeCommercialFunnel([{ slug: 'novo-proprietario' }]),
      false,
    );
  });
});


describe('ativação de funil por tipo', () => {
  it('desativa só o mesmo tenant e tipo', () => {
    const where = whereDeactivateActiveOfTipo(
      'tenant-1',
      FunilTipo.captacao,
      'funil-b',
    );
    assert.equal(where.tenantId, 'tenant-1');
    assert.equal(where.tipo, FunilTipo.captacao);
    assert.equal(where.ativo, true);
    assert.deepEqual(where.NOT, { id: 'funil-b' });
  });

  it('sem exceptId desativa qualquer ativo daquele tipo', () => {
    const where = whereDeactivateActiveOfTipo('tenant-1', FunilTipo.comercial);
    assert.equal(where.tipo, FunilTipo.comercial);
    assert.equal(where.NOT, undefined);
  });

  it('captação e comercial são tipos distintos na cláusula', () => {
    const cap = whereDeactivateActiveOfTipo('t', FunilTipo.captacao);
    const com = whereDeactivateActiveOfTipo('t', FunilTipo.comercial);
    const usados = whereDeactivateActiveOfTipo('t', FunilTipo.venda_usados);
    assert.notEqual(cap.tipo, com.tipo);
    assert.notEqual(com.tipo, usados.tipo);
    assert.notEqual(cap.tipo, usados.tipo);
  });
});
