import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Role } from '@prisma/client';
import {
  hasAnyUserModule,
  hasModuleVerb,
  httpPermissionVerb,
  modulesForApiPath,
} from '../utils/user-permissions';

function wouldAllow(
  role: Role,
  requiredRoles: Role[],
  path: string,
  method: string,
  permissions: { modules: Record<string, boolean>; actions: Record<string, boolean> } | null,
) {
  const allowed = requiredRoles.some((item) => item === role);
  const modules = modulesForApiPath(path);
  const moduleOk = hasAnyUserModule(role, permissions, modules);
  if (!allowed && !moduleOk) return false;
  const verb = httpPermissionVerb(method);
  if (verb && modules.length > 0) {
    const explicitDeny = modules.every(
      (moduleKey) => permissions?.actions?.[`${moduleKey}.${verb}`] === false,
    );
    if (explicitDeny) return false;
    if (!allowed) {
      return modules.some((moduleKey) =>
        hasModuleVerb(role, permissions, moduleKey, verb),
      );
    }
  }
  return true;
}

describe('RolesGuard + módulos concedidos', () => {
  const dashboardRoles = [Role.admin, Role.gerente];

  it('bloqueia analista no dashboard sem permissão', () => {
    assert.equal(
      wouldAllow(Role.analista, dashboardRoles, '/dashboard/admin', 'GET', null),
      false,
    );
  });

  it('libera analista no dashboard quando o módulo foi concedido', () => {
    assert.equal(
      wouldAllow(Role.analista, dashboardRoles, '/dashboard/admin', 'GET', {
        modules: { dashboard: true },
        actions: {},
      }),
      true,
    );
  });

  it('libera ranking se conceder Taxa de conversão', () => {
    assert.equal(
      wouldAllow(Role.analista, dashboardRoles, '/dashboard/ranking', 'GET', {
        modules: { taxaConversao: true },
        actions: {},
      }),
      true,
    );
  });

  it('deixa alterar usuários quando o módulo Usuários foi concedido', () => {
    assert.equal(
      wouldAllow(Role.analista, [Role.admin], '/users/abc', 'PATCH', {
        modules: { usuarios: true },
        actions: {},
      }),
      true,
    );
  });

  it('corretor com Financeiro lança e altera comissão', () => {
    assert.equal(
      wouldAllow(Role.corretor, [Role.admin, Role.financeiro], '/financeiro/comissao', 'POST', {
        modules: { financeiro: true },
        actions: {},
      }),
      true,
    );
    assert.equal(
      wouldAllow(Role.corretor, [Role.admin, Role.financeiro], '/financeiro/titulos', 'DELETE', {
        modules: { financeiro: true },
        actions: {},
      }),
      true,
    );
    assert.equal(
      wouldAllow(Role.corretor, [Role.admin, Role.financeiro], '/financeiro/titulos', 'POST', null),
      false,
    );
  });

  it('corretor só com visualizar não cria lead', () => {
    assert.equal(
      wouldAllow(Role.corretor, [Role.admin, Role.corretor], '/leads', 'POST', {
        modules: { leads: true },
        actions: { 'leads.create': false },
      }),
      false,
    );
    assert.equal(
      wouldAllow(Role.corretor, [Role.admin, Role.corretor], '/leads', 'GET', {
        modules: { leads: true },
        actions: { 'leads.view': true, 'leads.create': false },
      }),
      true,
    );
  });

  it('libera listagem de usuários com módulo Usuários', () => {
    assert.equal(
      wouldAllow(Role.corretor, [Role.admin, Role.gerente, Role.analista], '/users', 'GET', {
        modules: { usuarios: true },
        actions: {},
      }),
      true,
    );
  });
});
