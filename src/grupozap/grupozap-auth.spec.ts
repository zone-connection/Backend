import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  extractGrupoZapSecret,
  isGrupoZapAuthorized,
} from './grupozap-auth';

const SECRET = '594F803B380A41396ED63DCA39503542';

describe('Grupo OLX Basic Auth', () => {
  it('decodifica vivareal:SECRET_KEY como na documentação', () => {
    const header =
      'Basic dml2YXJlYWw6NTk0RjgwM0IzODBBNDEzOTZFRDYzRENBMzk1MDM1NDI=';
    assert.equal(extractGrupoZapSecret(header), SECRET);
    assert.equal(isGrupoZapAuthorized(header, SECRET), true);
  });

  it('rejeita chave diferente e header ausente', () => {
    const header = `Basic ${Buffer.from(`vivareal:outra-chave`).toString('base64')}`;
    assert.equal(isGrupoZapAuthorized(header, SECRET), false);
    assert.equal(isGrupoZapAuthorized(undefined, SECRET), false);
    assert.equal(extractGrupoZapSecret('Bearer abc'), null);
  });
});
