import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractOruloBuildingIds } from './orulo-ids';

describe('extractOruloBuildingIds', () => {
  it('lê buildings[].id em string da documentação oficial', () => {
    assert.deepEqual(
      extractOruloBuildingIds({
        buildings: [{ id: '34234', updated_at: '01/08/2016 15:29:42' }],
      }),
      [34234],
    );
  });

  it('lê building_ids do guia de CRM', () => {
    assert.deepEqual(
      extractOruloBuildingIds({
        building_ids: [{ id: 123, updated_at: '...' }],
      }),
      [123],
    );
  });
});
