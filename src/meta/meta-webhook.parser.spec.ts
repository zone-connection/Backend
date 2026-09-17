import { createHmac } from 'crypto';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { extractLeadgenEvents } from './meta-webhook.parser';

const REAL_PAGE_ID = '1171170866089778';

describe('extractLeadgenEvents', () => {
  it('extrai o payload dummy da ferramenta de teste da Meta', () => {
    const result = extractLeadgenEvents({
      object: 'page',
      entry: [
        {
          id: '444444444444',
          time: 1,
          changes: [
            {
              field: 'leadgen',
              value: {
                leadgen_id: '444444444444',
                page_id: '444444444444',
                form_id: '444444444444',
                ad_id: '444444444444',
                adgroup_id: '444444444444',
                created_time: 1,
              },
            },
          ],
        },
      ],
    });

    assert.equal(result.events.length, 1);
    assert.equal(result.events[0].pageId, '444444444444');
    assert.equal(result.events[0].leadgenId, '444444444444');
    assert.equal(result.events[0].pageIdSource, 'value');
  });

  it('aceita campos extras de campanha real (campaign_id) sem descartar o evento', () => {
    const result = extractLeadgenEvents({
      object: 'page',
      entry: [
        {
          id: REAL_PAGE_ID,
          time: 1,
          extra_entry_field: true,
          changes: [
            {
              field: 'leadgen',
              value: {
                leadgen_id: '999000111222',
                page_id: REAL_PAGE_ID,
                form_id: '555',
                ad_id: '666',
                adgroup_id: '777',
                campaign_id: '888',
                created_time: 1,
              },
            },
          ],
        },
      ],
    });

    assert.equal(result.skipped.length, 0);
    assert.equal(result.events.length, 1);
    assert.equal(result.events[0].pageId, REAL_PAGE_ID);
    assert.equal(result.events[0].leadgenId, '999000111222');
  });

  it('usa entry.id quando value.page_id está ausente', () => {
    const result = extractLeadgenEvents({
      object: 'page',
      entry: [
        {
          id: REAL_PAGE_ID,
          changes: [
            {
              field: 'leadgen',
              value: { leadgen_id: '1234567890' },
            },
          ],
        },
      ],
    });

    assert.equal(result.events.length, 1);
    assert.equal(result.events[0].pageId, REAL_PAGE_ID);
    assert.equal(result.events[0].pageIdSource, 'entry');
  });

  it('converte IDs numéricos para string', () => {
    const result = extractLeadgenEvents({
      object: 'page',
      entry: [
        {
          id: 1171170866089778,
          changes: [
            {
              field: 'leadgen',
              value: {
                leadgen_id: 123456789012345,
                page_id: 1171170866089778,
              },
            },
          ],
        },
      ],
    });

    assert.equal(result.events[0].pageId, '1171170866089778');
    assert.equal(result.events[0].leadgenId, '123456789012345');
  });

  it('registra skip quando leadgen_id falta', () => {
    const result = extractLeadgenEvents({
      object: 'page',
      entry: [
        {
          id: REAL_PAGE_ID,
          changes: [{ field: 'leadgen', value: { page_id: REAL_PAGE_ID } }],
        },
      ],
    });

    assert.equal(result.events.length, 0);
    assert.equal(result.skipped[0].reason, 'leadgen_id_ausente');
  });

  it('registra skip quando page_id falta em value e em entry', () => {
    const result = extractLeadgenEvents({
      object: 'page',
      entry: [
        {
          changes: [
            { field: 'leadgen', value: { leadgen_id: '1' } },
          ],
        },
      ],
    });

    assert.equal(result.events.length, 0);
    assert.equal(result.skipped[0].reason, 'page_id_ausente');
  });

  it('ignora campos que não são leadgen', () => {
    const result = extractLeadgenEvents({
      object: 'page',
      entry: [
        {
          id: REAL_PAGE_ID,
          changes: [{ field: 'feed', value: {} }],
        },
      ],
    });

    assert.equal(result.events.length, 0);
    assert.equal(result.skipped[0].reason, 'campo_ignorado');
  });
});

describe('HMAC helper used by webhook tests', () => {
  it('gera assinatura sha256= compatível com o guard', () => {
    const secret = 'test-app-secret-value';
    const body = Buffer.from('{"object":"page","entry":[]}');
    const hex = createHmac('sha256', secret).update(body).digest('hex');
    assert.match(hex, /^[a-f0-9]{64}$/);
  });
});
