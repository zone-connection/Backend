import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Role } from '@prisma/client';
import {
  hasAnyUserModule,
  isSensitiveApiWrite,
  modulesForApiPath,
} from '../utils/user-permissions';

function wouldAllow(
  role: Role,
  requiredRoles: Role[],
  path: string,
  method: string,
  permissions: { modules: Record<string, boolean>; actions: Record<string, boolean> } | null,
) {
  if (requiredRoles.some((allowed) => allowed === role)) return true;
  if (isSensitiveApiWrite(path, method)) return false;
  return hasAnyUserModule(role, permissions, modulesForApiPath(path));
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

  it('não deixa analista alterar usuários só com módulo Usuários', () => {
    assert.equal(
      wouldAllow(Role.analista, [Role.admin], '/users/abc', 'PATCH', {
        modules: { usuarios: true },
        actions: {},
      }),
      false,
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
