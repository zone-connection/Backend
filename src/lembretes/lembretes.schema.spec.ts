import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Prisma } from '@prisma/client';
import { isLembretesSchemaMissing } from './lembretes.schema';

describe('isLembretesSchemaMissing', () => {
  it('reconhece tabela ausente do Prisma', () => {
    const err = new Prisma.PrismaClientKnownRequestError('missing', {
      code: 'P2021',
      clientVersion: 'test',
    });
    assert.equal(isLembretesSchemaMissing(err), true);
  });

  it('ignora conflito de unique', () => {
    const err = new Prisma.PrismaClientKnownRequestError('unique', {
      code: 'P2002',
      clientVersion: 'test',
    });
    assert.equal(isLembretesSchemaMissing(err), false);
  });
});
