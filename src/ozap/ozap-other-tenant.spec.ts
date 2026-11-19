import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { UserStatus } from '@prisma/client';
import { phonesOwnedByOtherTenants } from './ozap-other-tenant';

describe('phonesOwnedByOtherTenants', () => {
  it('reconhece lead e colaborador de outra imobiliária', async () => {
    const db = {
      lead: {
        findMany: async () => [{ telefone: '(81) 99999-1111' }],
      },
      user: {
        findMany: async () => [
          { whatsapp: '81988882222', phone: null },
        ],
      },
    };
    const owned = await phonesOwnedByOtherTenants(db, 'tenant-a', [
      '5581999991111',
      '(81) 98888-2222',
      '(81) 97777-3333',
    ]);
    assert.equal(owned.has('81999991111'), true);
    assert.equal(owned.has('81988882222'), true);
    assert.equal(owned.has('81977773333'), false);
    assert.equal(UserStatus.ativo, 'ativo');
  });
});
