import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FunilEtapaPapel, FunilTipo, Role } from '@prisma/client';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { FunisService } from './funis.service';

const TENANT = 't1';
const ORIGEM = 'funil-origem';
const DESTINO = 'funil-destino';

const requester = {
  id: 'u1',
  email: 'admin@imob.com',
  role: Role.admin,
  name: 'Admin',
  tenantId: TENANT,
} as AuthenticatedUser;

function etapa(
  slug: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id: `etapa-${slug}`,
    funilId: DESTINO,
    label: slug,
    slug,
    color: 'bg-slate-200 text-slate-700',
    sortOrder: 0,
    active: true,
    papel: null as FunilEtapaPapel | null,
    prazoValor: null,
    prazoUnidade: 'horas',
    alertaAntecedenciaPercent: 20,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function destinoFunil(etapas: ReturnType<typeof etapa>[]) {
  return {
    id: DESTINO,
    tenantId: TENANT,
    name: 'Comercial B',
    tipo: FunilTipo.comercial,
    ativo: false,
    inatividadeValor: 48,
    inatividadeUnidade: 'horas',
    atrasoLiberacaoAtiva: false,
    atrasoLiberacaoDestino: 'retrabalho',
    atrasoLiberacaoValor: 24,
    atrasoLiberacaoUnidade: 'horas',
    distribuicaoAutoAtiva: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    etapas,
  };
}

type Harness = {
  service: FunisService;
  updates: Array<{ where: unknown; data: Record<string, unknown> }>;
  deletes: string[];
  stageCalls: unknown[][];
  owned?: Record<string, unknown> | null;
  destino?: ReturnType<typeof destinoFunil> | null;
  funilCount?: number;
  leadCount?: number;
};

function harness(opts: {
  owned?: Record<string, unknown> | null;
  destino?: ReturnType<typeof destinoFunil> | null;
  funilCount?: number;
  leadCount?: number;
  migrated?: number;
} = {}): Harness {
  const updates: Harness['updates'] = [];
  const deletes: string[] = [];
  const stageCalls: unknown[][] = [];
  const owned =
    opts.owned === undefined
      ? {
          id: ORIGEM,
          ativo: false,
          name: 'Comercial A',
          tipo: FunilTipo.comercial,
        }
      : opts.owned;
  const destino =
    opts.destino === undefined
      ? destinoFunil([
          etapa('qualificacao', { sortOrder: 0 }),
          etapa('novo', {
            sortOrder: 1,
            papel: FunilEtapaPapel.inicial,
          }),
        ])
      : opts.destino;

  const prisma = {
    funil: {
      findFirst: async (args: { where: Record<string, unknown> }) => {
        const where = args.where;
        if (where.tipo === FunilTipo.comercial && where.id === DESTINO) {
          return destino;
        }
        if (where.id === ORIGEM && !where.tipo) return owned;
        if (where.ativo === true) return { id: 'funil-em-uso' };
        if (where.id === 'funil-em-uso') {
          return destinoFunil([]);
        }
        return null;
      },
      count: async () => opts.funilCount ?? 2,
      delete: async (args: { where: { id: string } }) => {
        deletes.push(args.where.id);
        return {};
      },
    },
    lead: {
      count: async () => opts.leadCount ?? 0,
      updateMany: async (args: {
        where: unknown;
        data: Record<string, unknown>;
      }) => {
        updates.push(args);
        return { count: opts.migrated ?? 4 };
      },
      groupBy: async () => [],
    },
  };

  const monitoramento = {
    stageChangeData: async (...args: unknown[]) => {
      stageCalls.push(args);
      return {
        stageEnteredAt: new Date('2026-09-22T12:00:00.000Z'),
        lastStageChangeAt: new Date('2026-09-22T12:00:00.000Z'),
        lastMovementAt: new Date('2026-09-22T12:00:00.000Z'),
        prazoAdiado: false,
        prazoDueAt: null,
        alertaProximoAt: null,
      };
    },
  };

  return {
    service: new FunisService(prisma as never, monitoramento as never),
    updates,
    deletes,
    stageCalls,
  };
}

describe('migração de leads entre funis', () => {
  it('coloca os leads na etapa inicial do destino, sem apagar corretor nem perda', async () => {
    const { service, updates, stageCalls } = harness({ migrated: 3 });
    const result = await service.migrarLeads(ORIGEM, DESTINO, requester);

    assert.equal(result.migrados, 3);
    assert.equal(result.stage, 'novo');
    assert.equal(updates.length, 1);
    assert.deepEqual(updates[0].where, {
      tenantId: TENANT,
      funilId: ORIGEM,
    });
    assert.equal(updates[0].data.funilId, DESTINO);
    assert.equal(updates[0].data.stage, 'novo');
    assert.equal(updates[0].data.prazoAdiado, false);
    assert.equal('corretorId' in updates[0].data, false);
    assert.equal('perdidoAt' in updates[0].data, false);
    assert.equal('nome' in updates[0].data, false);
    assert.equal(stageCalls[0]?.[0], TENANT);
    assert.equal(stageCalls[0]?.[1], 'novo');
    assert.equal(stageCalls[0]?.[3], DESTINO);
  });

  it('aceita slug legado "novo" como etapa inicial', async () => {
    const { service, updates } = harness({
      destino: destinoFunil([
        etapa('contato', { sortOrder: 0 }),
        etapa('novo', { sortOrder: 2, papel: null }),
      ]),
    });
    const result = await service.migrarLeads(ORIGEM, DESTINO, requester);
    assert.equal(result.stage, 'novo');
    assert.equal(updates[0].data.stage, 'novo');
  });

  it('ignora etapa inicial desativada e usa a primeira etapa ativa', async () => {
    const { service } = harness({
      destino: destinoFunil([
        etapa('novo', {
          sortOrder: 0,
          active: false,
          papel: FunilEtapaPapel.inicial,
        }),
        etapa('contato', { sortOrder: 1 }),
      ]),
    });
    const result = await service.migrarLeads(ORIGEM, DESTINO, requester);
    assert.equal(result.stage, 'contato');
  });

  it('não grava nada se o destino não tem etapa ativa', async () => {
    const { service, updates, stageCalls } = harness({
      destino: destinoFunil([
        etapa('novo', { active: false, papel: FunilEtapaPapel.inicial }),
      ]),
    });
    await assert.rejects(
      () => service.migrarLeads(ORIGEM, DESTINO, requester),
      BadRequestException,
    );
    assert.equal(updates.length, 0);
    assert.equal(stageCalls.length, 0);
  });

  it('recusa migrar o funil para ele mesmo', async () => {
    const { service, updates } = harness();
    await assert.rejects(
      () => service.migrarLeads(ORIGEM, ORIGEM, requester),
      BadRequestException,
    );
    assert.equal(updates.length, 0);
  });

  it('recusa funil de captação', async () => {
    const { service, updates } = harness({
      owned: {
        id: ORIGEM,
        ativo: false,
        name: 'Captação',
        tipo: FunilTipo.captacao,
      },
    });
    await assert.rejects(
      () => service.migrarLeads(ORIGEM, DESTINO, requester),
      BadRequestException,
    );
    assert.equal(updates.length, 0);
  });

  it('recusa destino de outro tenant ou inexistente', async () => {
    const { service, updates } = harness({ destino: null });
    await assert.rejects(
      () => service.migrarLeads(ORIGEM, DESTINO, requester),
      NotFoundException,
    );
    assert.equal(updates.length, 0);
  });

  it('recusa origem de outro tenant', async () => {
    const { service, updates } = harness({ owned: null });
    await assert.rejects(
      () => service.migrarLeads(ORIGEM, DESTINO, requester),
      NotFoundException,
    );
    assert.equal(updates.length, 0);
  });

  it('funil sem leads migra zero e não inventa card', async () => {
    const { service, updates } = harness({ migrated: 0 });
    const result = await service.migrarLeads(ORIGEM, DESTINO, requester);
    assert.equal(result.migrados, 0);
    assert.equal(updates.length, 1);
    assert.equal(updates[0].data.funilId, DESTINO);
  });
});

describe('exclusão de funil com leads', () => {
  it('não exclui funil comercial que ainda tem leads', async () => {
    const { service, deletes } = harness({ leadCount: 2, funilCount: 2 });
    await assert.rejects(
      () => service.remove(ORIGEM, requester),
      (err: unknown) => {
        assert.ok(err instanceof BadRequestException);
        assert.match(String((err as Error).message), /Migre os leads/);
        return true;
      },
    );
    assert.deepEqual(deletes, []);
  });

  it('não exclui o funil que está em uso', async () => {
    const { service, deletes } = harness({
      owned: {
        id: ORIGEM,
        ativo: true,
        name: 'Comercial A',
        tipo: FunilTipo.comercial,
      },
      funilCount: 2,
    });
    await assert.rejects(
      () => service.remove(ORIGEM, requester),
      BadRequestException,
    );
    assert.deepEqual(deletes, []);
  });

  it('não exclui o único funil do tipo', async () => {
    const { service, deletes } = harness({ funilCount: 1 });
    await assert.rejects(
      () => service.remove(ORIGEM, requester),
      BadRequestException,
    );
    assert.deepEqual(deletes, []);
  });

  it('exclui funil comercial vazio que não está em uso', async () => {
    const { service, deletes } = harness({ leadCount: 0, funilCount: 2 });
    const result = await service.remove(ORIGEM, requester);
    assert.deepEqual(result, { ok: true });
    assert.deepEqual(deletes, [ORIGEM]);
  });
});

describe('migration dos leads atuais', () => {
  const sql = fs.readFileSync(
    path.join(
      __dirname,
      '../../prisma/migrations/20260922150000_lead_funil/migration.sql',
    ),
    'utf8',
  );

  it('prende todos os leads no mesmo funil comercial em uso', () => {
    assert.match(sql, /DISTINCT ON \("tenantId"\)/);
    assert.match(sql, /"tipo" = 'comercial' AND "ativo" = true/);
    assert.match(sql, /ORDER BY "tenantId", "updatedAt" DESC, "createdAt" ASC/);
  });

  it('não muda etapa, nome nem desativa funil existente', () => {
    assert.doesNotMatch(sql, /SET\s+"stage"/i);
    assert.doesNotMatch(sql, /SET\s+"name"/i);
    assert.doesNotMatch(sql, /"ativo"\s*=\s*false/i);
    assert.equal(sql.includes('DELETE FROM "leads"'), false);
  });

  it('só exige funil preenchido depois do backfill', () => {
    const backfill = sql.indexOf('SET "funilId"');
    const notNull = sql.indexOf('SET NOT NULL');
    assert.ok(backfill >= 0 && notNull > backfill);
  });

  it('não cria etapa em funil antigo quando o nome já existe', () => {
    assert.match(sql, /RETURNING "id", "tenantId"/);
    assert.match(sql, /FROM novos n/);
    assert.equal(
      sql.includes(`WHERE f."name" = 'Comercial (leads)'`),
      false,
    );
  });
});
