import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Role } from '@prisma/client';
import { canFinanceiroAction } from './financeiro-perms';
import {
  defaultsFromRole,
  hasAnyUserModule,
  hasUserAction,
  hasUserModule,
  isSensitiveApiWrite,
  moduleGrantedBeyondRole,
  modulesForApiPath,
  storedModuleEnabled,
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
    assert.equal(defaultsFromRole(Role.admin).modules.parcerias, true);
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
    assert.deepEqual(modulesForApiPath('/captacao/proprietarios'), ['imoveis']);
    assert.deepEqual(modulesForApiPath('/captacao/imoveis'), ['imoveis']);
    assert.deepEqual(modulesForApiPath('/captacao'), ['captacao']);
    assert.deepEqual(modulesForApiPath('/imoveis-usados'), ['imoveisUsados']);
    assert.deepEqual(modulesForApiPath('/imoveis-usados/interessados'), [
      'imoveisUsados',
    ]);
    assert.deepEqual(modulesForApiPath('/portal-proprietario/imoveis'), []);
    assert.deepEqual(modulesForApiPath('/portal-parceiros/imoveis'), []);
    assert.deepEqual(modulesForApiPath('/parcerias'), ['parcerias']);
  });

  it('não libera escrita sensível só com módulo', () => {
    assert.equal(isSensitiveApiWrite('/users/abc', 'PATCH'), true);
    assert.equal(isSensitiveApiWrite('/users', 'GET'), false);
    assert.equal(isSensitiveApiWrite('/equipes/1', 'POST'), true);
    assert.equal(isSensitiveApiWrite('/dashboard/admin', 'GET'), false);
  });

  it('analista com financeiro concedido cria, edita e exclui como o admin do módulo', () => {
    const permissions = {
      modules: { financeiro: true },
      actions: {},
    };
    const user = {
      role: Role.analista,
      financeiroPerms: undefined,
      permissions,
    };
    assert.equal(canFinanceiroAction(user, 'view'), true);
    assert.equal(canFinanceiroAction(user, 'create'), true);
    assert.equal(canFinanceiroAction(user, 'edit'), true);
    assert.equal(canFinanceiroAction(user, 'delete'), true);
    assert.equal(
      hasUserAction(Role.analista, permissions, 'financeiro.comissao'),
      true,
    );
    assert.equal(
      hasUserAction(Role.analista, permissions, 'financeiro.export'),
      true,
    );
  });

  it('corretor com Financeiro faz tudo do módulo e vê a imobiliária', () => {
    const permissions = { modules: { financeiro: true }, actions: {} };
    assert.equal(
      moduleGrantedBeyondRole(Role.corretor, permissions, 'financeiro'),
      true,
    );
    assert.equal(storedModuleEnabled(permissions, 'financeiro'), true);
    for (const action of [
      'financeiro.access',
      'financeiro.pagar.create',
      'financeiro.pagar.edit',
      'financeiro.pagar.delete',
      'financeiro.receber.create',
      'financeiro.receber.edit',
      'financeiro.receber.delete',
      'financeiro.fluxo',
      'financeiro.comissao',
      'financeiro.export',
    ]) {
      assert.equal(hasUserAction(Role.corretor, permissions, action), true, action);
    }
    assert.equal(
      canFinanceiroAction(
        { role: Role.corretor, financeiroPerms: undefined, permissions },
        'create',
      ),
      true,
    );
  });

  it('corretor sem Financeiro não lança título nem comissão da imobiliária', () => {
    assert.equal(
      hasUserAction(Role.corretor, null, 'financeiro.pagar.create'),
      false,
    );
    assert.equal(
      moduleGrantedBeyondRole(Role.corretor, null, 'financeiro'),
      false,
    );
    assert.equal(
      moduleGrantedBeyondRole(
        Role.corretor,
        { modules: { comissao: true }, actions: {} },
        'comissao',
      ),
      false,
    );
  });

  it('ranking, documentação e vendas gerais só abrem quando a permissão foi gravada', () => {
    const permissions = {
      modules: { corretores: true, documentacao: true, vendas: true },
      actions: {},
    };
    assert.equal(storedModuleEnabled(permissions, 'corretores'), true);
    assert.equal(
      moduleGrantedBeyondRole(Role.corretor, permissions, 'corretores'),
      true,
    );
    assert.equal(storedModuleEnabled(permissions, 'documentacao'), true);
    assert.equal(storedModuleEnabled(permissions, 'vendas'), true);
    assert.equal(storedModuleEnabled(null, 'corretores'), false);
    assert.equal(hasUserModule(Role.corretor, null, 'corretores'), false);
  });

  it('presença do corretor só liga se a permissão foi concedida', () => {
    assert.equal(hasUserModule(Role.corretor, null, 'presenca'), false);
    assert.equal(
      hasUserModule(
        Role.corretor,
        { modules: { presenca: true }, actions: {} },
        'presenca',
      ),
      true,
    );
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
