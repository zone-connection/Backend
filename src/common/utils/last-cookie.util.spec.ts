import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyLastWinsCookies, lastCookieValue } from './last-cookie.util';

describe('lastCookieValue', () => {
  it('fica com o último de dois crm_refresh', () => {
    const header =
      'crm_refresh=antigo; crm_csrf=a; crm_refresh=novo; crm_csrf=b';
    assert.equal(lastCookieValue(header, 'crm_refresh'), 'novo');
    assert.equal(lastCookieValue(header, 'crm_csrf'), 'b');
  });

  it('sem header retorna undefined', () => {
    assert.equal(lastCookieValue(undefined, 'crm_refresh'), undefined);
  });
});

describe('applyLastWinsCookies', () => {
  it('sobrescreve o valor que o parser guardou primeiro', () => {
    const cookies: Record<string, unknown> = { crm_csrf: 'primeiro' };
    applyLastWinsCookies(cookies, 'crm_csrf=primeiro; crm_csrf=ultimo', [
      'crm_csrf',
    ]);
    assert.equal(cookies.crm_csrf, 'ultimo');
  });
});
