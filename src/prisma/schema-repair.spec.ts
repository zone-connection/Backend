import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Prisma } from '@prisma/client';
import {
  ensurePosVendaSchema,
  isMissingDatabaseObject,
} from './schema-repair';

describe('schema-repair', () => {
  it('reconhece coluna ausente do Prisma', () => {
    const err = new Prisma.PrismaClientKnownRequestError('missing', {
      code: 'P2022',
      clientVersion: 'test',
    });
    assert.equal(isMissingDatabaseObject(err), true);
  });

  it('ignora conflito de unique', () => {
    const err = new Prisma.PrismaClientKnownRequestError('unique', {
      code: 'P2002',
      clientVersion: 'test',
    });
    assert.equal(isMissingDatabaseObject(err), false);
  });

  it('aplica os ALTERs na tabela vendas_usado', async () => {
    const sqls: string[] = [];
    await ensurePosVendaSchema({
      $executeRawUnsafe: async (sql: string) => {
        sqls.push(sql);
        return 0;
      },
    } as never);
    assert.ok(sqls.some((sql) => sql.includes('"vendas_usado"')));
    assert.ok(sqls.some((sql) => sql.includes('posVendaRecusadoEm')));
    assert.ok(sqls.every((sql) => !sql.includes('"venda_usados"')));
  });
});
