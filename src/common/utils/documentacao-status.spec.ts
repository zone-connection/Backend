import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isStatusAprovado,
  isStatusParecerFinal,
  status1Group,
} from './documentacao-status';

describe('status1 da documentação', () => {
  it('não junta Aprovado c/ restrição com Aprovado', () => {
    assert.equal(status1Group('Aprovado'), 'aprovado');
    assert.equal(status1Group('Aprovado c/ restrição'), null);
    assert.equal(isStatusAprovado('Aprovado'), true);
    assert.equal(isStatusAprovado('Aprovado c/ restrição'), false);
    assert.equal(isStatusParecerFinal('Aprovado'), true);
    assert.equal(isStatusParecerFinal('Aprovado c/ restrição'), false);
  });

  it('reconhece análise e reprovado', () => {
    assert.equal(status1Group('Em análise'), 'analise');
    assert.equal(status1Group('Reprovado'), 'reprovado');
  });
});
