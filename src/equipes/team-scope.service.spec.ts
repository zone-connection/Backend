import assert from 'node:assert/strict';
import test from 'node:test';
import { Role } from '@prisma/client';
import { TeamScopeService } from './team-scope.service';
import type { AuthenticatedUser } from '../common/types/authenticated-user';

function prismaFalso() {
  return {
    equipe: {
      findMany: async () => [{ id: 'eq-1', membros: [{ id: 'corretor-1' }] }],
    },
    tenantMetaConnection: { findMany: async () => [] },
    tenantOzapConnection: { findMany: async () => [] },
    imovel: { findMany: async () => [] },
    user: { findFirst: async () => ({ equipeId: 'eq-1' }) },
  };
}

function user(role: Role, id = 'u1'): AuthenticatedUser {
  return {
    id,
    email: `${id}@teste.local`,
    role,
    name: id,
    tenantId: 't1',
    tenantModules: {},
  };
}

test('corretor só enxerga a própria carteira', async () => {
  const scope = await new TeamScopeService(prismaFalso() as never).leadScope(
    user(Role.corretor, 'corretor-1'),
  );
  const and = scope.AND as Array<Record<string, unknown>>;
  assert.equal(scope.tenantId, 't1');
  assert.deepEqual(and[0], { corretorId: { in: ['corretor-1'] } });
  assert.equal(scope.OR, undefined);
  const texto = JSON.stringify(scope);
  assert.equal(texto.includes('"equipeId"'), false);
  assert.equal(texto.includes('metaLink'), false);
});

test('gerente continua vendo a equipe e o isolamento de canal', async () => {
  const scope = await new TeamScopeService(prismaFalso() as never).leadScope(
    user(Role.gerente, 'gerente-1'),
  );
  const texto = JSON.stringify(scope);
  assert.equal(texto.includes('corretor-1') || texto.includes('gerente-1'), true);
  assert.equal(texto.includes('"equipeId":"eq-1"'), true);
  assert.equal(texto.includes('metaLink'), true);
});

test('admin continua com isolamento de canal e sem filtro de corretor', async () => {
  const scope = await new TeamScopeService(prismaFalso() as never).leadScope(
    user(Role.admin),
  );
  assert.equal(scope.tenantId, 't1');
  assert.equal(JSON.stringify(scope).includes('metaLink'), true);
  assert.equal(JSON.stringify(scope).includes('corretorId'), false);
});
