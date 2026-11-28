import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CaptacaoImovelTipo } from '@prisma/client';
import { interessadoCompativel } from './venda-usado.matching';

describe('matching de usados', () => {
  const imovel = {
    tipo: CaptacaoImovelTipo.apartamento,
    cidade: 'Recife',
    bairro: 'Centro',
    quartos: 3,
    banheiros: 2,
    vagas: 1,
    area: 80,
    preco: 450000,
  };

  it('aceita preferência compatível', () => {
    assert.equal(
      interessadoCompativel(imovel, {
        tipoDesejado: CaptacaoImovelTipo.apartamento,
        cidade: 'Recife',
        bairros: 'Centro, Boa Viagem',
        precoMin: 400000,
        precoMax: 500000,
        quartosMin: 3,
        banheirosMin: 1,
        vagasMin: 1,
        areaMin: 70,
      }),
      true,
    );
  });

  it('aceita preferência vazia (sem filtros)', () => {
    assert.equal(
      interessadoCompativel(imovel, {
        tipoDesejado: null,
        cidade: '',
        bairros: '',
        precoMin: null,
        precoMax: null,
        quartosMin: null,
        banheirosMin: null,
        vagasMin: null,
        areaMin: null,
      }),
      true,
    );
  });

  it('rejeita cidade e preço fora da faixa', () => {
    assert.equal(
      interessadoCompativel(imovel, {
        tipoDesejado: null,
        cidade: 'Olinda',
        bairros: '',
        precoMin: null,
        precoMax: 400000,
        quartosMin: null,
        banheirosMin: null,
        vagasMin: null,
        areaMin: null,
      }),
      false,
    );
  });
});
