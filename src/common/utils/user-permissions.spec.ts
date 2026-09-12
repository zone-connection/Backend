import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Role } from '@prisma/client';
import { canFinanceiroAction } from './financeiro-perms';
import {
  defaultsFromRole,
  hasAnyUserModule,
  hasUserModule,
  isSensitiveApiWrite,
  modulesForApiPath,
} from './user-permissions';

describe('permissões por usuário', () => {
  it('analista não tem dashboard por padrão', () => {
    assert.equal(hasUserModule(Role.analista, null, 'dashboard'), false);
    assert.equal(defaultsFromRole(Role.analista).modules.dashboard, false);
  });

  it('captação, imóveis usados e locação ficam desligados por padrão (fundação)', () => {
    assert.equal(defaultsFromRole(Role.admin).modules.captacao, false);
    assert.equal(defaultsFromRole(Role.admin).modules.imoveisUsados, false);
    assert.equal(defaultsFromRole(Role.admin).modules.locacao, false);
    assert.equal(hasUserModule(Role.corretor, null, 'imoveisUsados'), false);
    assert.equal(
      hasUserModule(
        Role.corretor,
        { modules: { imoveisUsados: true }, actions: {} },
        'imoveisUsados',
      ),
      true,
    );
  });

  it('analista vê dashboard quando o módulo é concedido', () => {
    const stored = {
      modules: { dashboard: true },
      actions: {},
    };
    assert.equal(hasUserModule(Role.analista, stored, 'dashboard'), true);
    assert.equal(
      hasAnyUserModule(Role.analista, stored, ['dashboard', 'corretores']),
      true,
    );
  });

  it('mapeia APIs para os módulos certos', () => {
    assert.deepEqual(modulesForApiPath('/dashboard/admin'), [
      'dashboard',
      'taxaConversao',
      'corretores',
    ]);
    assert.deepEqual(modulesForApiPath('/dashboard/ranking'), [
      'corretores',
      'taxaConversao',
      'dashboard',
    ]);
    assert.deepEqual(modulesForApiPath('/leads/monitoramento/corretores'), [
      'atrasos',
    ]);
    assert.deepEqual(modulesForApiPath('/financeiro/visao-geral'), [
      'financeiro',
    ]);
    assert.deepEqual(modulesForApiPath('/financeiro/comissao'), [
      'comissao',
      'financeiro',
    ]);
    assert.deepEqual(modulesForApiPath('/captacao/proprietarios'), ['captacao']);
    assert.deepEqual(modulesForApiPath('/imoveis-usados'), ['imoveisUsados']);
    assert.deepEqual(modulesForApiPath('/imoveis-usados/interessados'), [
      'imoveisUsados',
    ]);
    assert.deepEqual(modulesForApiPath('/portal-proprietario/imoveis'), []);
  });

  it('não libera escrita sensível só com módulo', () => {
    assert.equal(isSensitiveApiWrite('/users/abc', 'PATCH'), true);
    assert.equal(isSensitiveApiWrite('/users', 'GET'), false);
    assert.equal(isSensitiveApiWrite('/equipes/1', 'POST'), true);
    assert.equal(isSensitiveApiWrite('/dashboard/admin', 'GET'), false);
  });

  it('analista com financeiro concedido pode ver e criar se as ações estiverem ligadas', () => {
    const user = {
      role: Role.analista,
      financeiroPerms: undefined,
      permissions: {
        modules: { financeiro: true },
        actions: {
          'financeiro.access': true,
          'financeiro.pagar.create': true,
        },
      },
    };
    assert.equal(canFinanceiroAction(user, 'view'), true);
    assert.equal(canFinanceiroAction(user, 'create'), true);
    assert.equal(canFinanceiroAction(user, 'delete'), false);
  });

  it('analista sem financeiro não acessa o módulo', () => {
    const user = {
      role: Role.analista,
      financeiroPerms: undefined,
      permissions: null,
    };
    assert.equal(canFinanceiroAction(user, 'view'), false);
  });
});
