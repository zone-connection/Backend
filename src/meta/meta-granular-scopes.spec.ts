import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { idsFromGranularScopes, parseGranularScopes } from './meta-granular-scopes';

describe('idsFromGranularScopes', () => {
  it('lê Páginas e contas do Login for Business', () => {
    const { pageIds, adAccountIds, businessIds } = idsFromGranularScopes([
      {
        scope: 'pages_show_list',
        target_ids: ['1531764452324519', '1551705624877061'],
      },
      { scope: 'leads_retrieval', target_ids: ['1551705624877061'] },
      { scope: 'ads_read', target_ids: ['1912223569743336'] },
      { scope: 'business_management', target_ids: ['1234567890'] },
    ]);
    assert.deepEqual(pageIds.sort(), ['1531764452324519', '1551705624877061']);
    assert.deepEqual(adAccountIds, ['act_1912223569743336']);
    assert.deepEqual(businessIds, ['1234567890']);
  });

  it('aceita granular_scopes em JSON string', () => {
    const parsed = parseGranularScopes(
      '[{"scope":"pages_show_list","target_ids":["99"]}]',
    );
    assert.deepEqual(idsFromGranularScopes(parsed).pageIds, ['99']);
  });
});
