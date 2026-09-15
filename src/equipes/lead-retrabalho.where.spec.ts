import assert from 'node:assert/strict';
import test from 'node:test';
import { AtrasoLiberacaoDestino } from '@prisma/client';
import { whereNotRetrabalho } from './lead-retrabalho.where';

test('whereNotRetrabalho inclui leads sem flag (carteira atual)', () => {
  const or = whereNotRetrabalho.OR;
  assert.ok(Array.isArray(or));
  assert.deepEqual(or?.[0], { origemAtrasoLiberacao: null });
  assert.deepEqual(or?.[1], {
    origemAtrasoLiberacao: { not: AtrasoLiberacaoDestino.retrabalho },
  });
});
