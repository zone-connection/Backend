import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isOruloRemoval,
  routeOruloWebhook,
} from './orulo-webhook-policy';

describe('routeOruloWebhook', () => {
  it('trata atualização de catálogo sem client_id', () => {
    assert.equal(
      routeOruloWebhook({ status: 'active' }),
      'catalog',
    );
    assert.equal(
      routeOruloWebhook({ status: 'removed' }),
      'catalog',
    );
  });

  it('roteia distribuição só quando há client_id', () => {
    assert.equal(
      routeOruloWebhook({
        status: 'excluded_from_distribution',
        clientId: 'app-1',
      }),
      'distribution',
    );
    assert.equal(
      routeOruloWebhook({ status: 'added_to_distribution' }),
      'ignore',
    );
    assert.equal(
      routeOruloWebhook({ status: 'excluded_from_distribution' }),
      'ignore',
    );
  });

  it('ignora status desconhecido', () => {
    assert.equal(
      routeOruloWebhook({ status: 'deleted', clientId: 'app-1' }),
      'ignore',
    );
  });
});

describe('isOruloRemoval', () => {
  it('marca só os status que apagam ou desativam', () => {
    assert.equal(isOruloRemoval('removed'), true);
    assert.equal(isOruloRemoval('excluded_from_distribution'), true);
    assert.equal(isOruloRemoval('active'), false);
    assert.equal(isOruloRemoval('added_to_distribution'), false);
  });
});
