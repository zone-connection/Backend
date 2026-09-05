import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isTenantOperationEnabled,
  mergeOperationModules,
  operationModuleForApiPath,
  pickOperationModules,
} from './tenant-operation.util';

describe('operações do tenant', () => {
  it('comercial fica ativo quando a chave não existe (tenants antigos)', () => {
    assert.equal(isTenantOperationEnabled({}, 'comercial'), true);
    assert.equal(isTenantOperationEnabled(null, 'comercial'), true);
  });

  it('captação, usados e locação nascem desligados', () => {
    assert.equal(isTenantOperationEnabled({}, 'captacao'), false);
    assert.equal(isTenantOperationEnabled({}, 'imoveisUsados'), false);
    assert.equal(isTenantOperationEnabled({}, 'locacao'), false);
  });

  it('respeita true/false gravados no JSON', () => {
    assert.equal(
      isTenantOperationEnabled({ captacao: true }, 'captacao'),
      true,
    );
    assert.equal(
      isTenantOperationEnabled({ captacao: false }, 'captacao'),
      false,
    );
  });

  it('reativar não exige apagar o funil — só a flag volta a true', () => {
    const stored = { captacao: false, funil: true };
    const again = mergeOperationModules(stored, { captacao: true });
    assert.equal(again.captacao, true);
    assert.equal(again.funil, true);
  });

  it('mapeia APIs futuras para a operação', () => {
    assert.equal(operationModuleForApiPath('/captacao/imoveis'), 'captacao');
    assert.equal(operationModuleForApiPath('imoveis-usados'), 'imoveisUsados');
    assert.equal(
      operationModuleForApiPath('/imoveis-usados/interessados'),
      'imoveisUsados',
    );
    assert.equal(operationModuleForApiPath('/locacao'), 'locacao');
    assert.equal(operationModuleForApiPath('/funis'), null);
  });

  it('pick devolve as quatro operações', () => {
    const ops = pickOperationModules({ captacao: true });
    assert.equal(ops.comercial, true);
    assert.equal(ops.captacao, true);
    assert.equal(ops.imoveisUsados, false);
    assert.equal(ops.locacao, false);
  });
});
