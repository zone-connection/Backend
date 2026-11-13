import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ORULO_PRODUCTION_REDIRECT_URI,
  resolveOruloRedirectUri,
} from './orulo-frontend-origin';

describe('resolveOruloRedirectUri', () => {
  it('usa a URI canônica em produção', () => {
    assert.equal(
      resolveOruloRedirectUri({
        frontendUrl:
          'http://localhost:8080,https://zoneconnection.com.br,https://www.zoneconnection.com.br',
      }),
      ORULO_PRODUCTION_REDIRECT_URI,
    );
  });

  it('ignora redirect antigo de Configurações', () => {
    assert.equal(
      resolveOruloRedirectUri({
        explicit:
          'https://www.zoneconnection.com.br/configuracoes?secao=conta&item=conexoes&orulo=callback',
        frontendUrl: 'https://www.zoneconnection.com.br',
      }),
      ORULO_PRODUCTION_REDIRECT_URI,
    );
  });
});
