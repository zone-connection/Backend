import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Role } from '@prisma/client';
import { DashboardService } from './dashboard.service';
import { QueryDashboardDto } from './dto/query-dashboard.dto';
import type { AuthenticatedUser } from '../common/types/authenticated-user';

const EQUIPE = '11111111-1111-4111-8111-111111111111';
const OUTRA = '22222222-2222-4222-8222-222222222222';

function admin(): AuthenticatedUser {
  return {
    id: 'admin-1',
    email: 'admin@teste.local',
    role: Role.admin,
    name: 'Admin',
    tenantId: 't1',
    tenantModules: {},
  };
}

type Restricao = {
  restringePorEquipes: (
    requester: AuthenticatedUser,
    equipeIds: string[] | undefined,
    corretorIds: string[] | null,
    leadScope: { tenantId: string },
  ) => Promise<{
    corretorIds: string[] | null;
    leadScope: { tenantId?: string; AND?: unknown[] };
  }>;
};

function service(equipes: unknown[]) {
  const prisma = {
    equipe: {
      findMany: async () => equipes,
    },
  };
  return new DashboardService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
  ) as unknown as Restricao;
}

test('sem equipeIds o recorte geral permanece intacto', async () => {
  const base = { tenantId: 't1' };
  const resultado = await service([]).restringePorEquipes(
    admin(),
    undefined,
    null,
    base,
  );
  assert.equal(resultado.corretorIds, null);
  assert.equal(resultado.leadScope, base);
});

test('equipe selecionada restringe corretores e leads', async () => {
  const resultado = await service([
    {
      id: EQUIPE,
      gerenteId: 'gerente-1',
      membros: [{ id: 'corretor-1' }],
    },
  ]).restringePorEquipes(admin(), [EQUIPE], null, { tenantId: 't1' });

  assert.deepEqual(resultado.corretorIds, ['gerente-1', 'corretor-1']);
  assert.ok(resultado.leadScope.AND);
  const filtro = resultado.leadScope.AND[1] as {
    OR: Array<Record<string, unknown>>;
  };
  assert.deepEqual(filtro.OR[0], { equipeId: { in: [EQUIPE] } });
  assert.deepEqual(filtro.OR[1], {
    corretorId: { in: ['gerente-1', 'corretor-1'] },
  });
});

test('equipe inexistente não abre a visão geral', async () => {
  await assert.rejects(
    () => service([]).restringePorEquipes(admin(), [OUTRA], null, { tenantId: 't1' }),
    /Equipe não encontrada/,
  );
});

test('query aceita várias equipes e ignora o filtro vazio', async () => {
  const varias = plainToInstance(QueryDashboardDto, {
    equipeIds: [EQUIPE, OUTRA],
  });
  assert.deepEqual(varias.equipeIds, [EQUIPE, OUTRA]);
  assert.equal((await validate(varias)).length, 0);

  const vazia = plainToInstance(QueryDashboardDto, { equipeIds: '' });
  assert.equal(vazia.equipeIds, undefined);

  const invalida = plainToInstance(QueryDashboardDto, {
    equipeIds: 'nao-e-uuid',
  });
  assert.equal((await validate(invalida)).length > 0, true);
});
