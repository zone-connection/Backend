import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mergeFunilPorEtapa, normalizeComodidades } from './captacao.util';

describe('mergeFunilPorEtapa', () => {
  it('inclui etapas sem volume com total zero', () => {
    const rows = mergeFunilPorEtapa(
      [
        {
          id: 'a',
          label: 'Novo',
          papel: 'inicial',
          color: '#111111',
          sortOrder: 0,
        },
        {
          id: 'b',
          label: 'Visita',
          papel: null,
          color: null,
          sortOrder: 1,
        },
      ],
      [{ funilEtapaId: 'a', _count: { _all: 3 } }],
    );
    assert.equal(rows.length, 2);
    assert.equal(rows[0]?.total, 3);
    assert.equal(rows[1]?.total, 0);
    assert.equal(rows[1]?.label, 'Visita');
  });
});

describe('normalizeComodidades', () => {
  it('remove vazios e duplicatas', () => {
    assert.deepEqual(
      normalizeComodidades([' Academia ', 'academia', '', 'Cinema']),
      ['Academia', 'Cinema'],
    );
  });
});
