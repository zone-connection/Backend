import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ConfigService } from '@nestjs/config';
import {
  safeOruloReturnTo,
  signOruloOAuthState,
  verifyOruloOAuthState,
} from './orulo-oauth-state';

function config() {
  return new ConfigService({ JWT_ACCESS_SECRET: 'test-orulo-oauth-secret' });
}

describe('orulo oauth state', () => {
  it('sanitiza returnTo aberto', () => {
    assert.equal(safeOruloReturnTo('https://evil.test'), '/imoveis');
    assert.equal(safeOruloReturnTo('//evil.test'), '/imoveis');
    assert.equal(safeOruloReturnTo('/imoveis/abc'), '/imoveis/abc');
  });

  it('assina e valida o state do corretor', () => {
    const cfg = config();
    const state = signOruloOAuthState(
      { uid: 'u1', tid: 't1', returnTo: '/imoveis/x' },
      cfg,
    );
    const parsed = verifyOruloOAuthState(state, cfg);
    assert.equal(parsed?.uid, 'u1');
    assert.equal(parsed?.tid, 't1');
    assert.equal(parsed?.returnTo, '/imoveis/x');
  });

  it('rejeita state adulterado', () => {
    const cfg = config();
    const state = signOruloOAuthState(
      { uid: 'u1', tid: 't1', returnTo: '/imoveis' },
      cfg,
    );
    assert.equal(verifyOruloOAuthState(`${state}x`, cfg), null);
  });
});
