import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

/** Espelha o filtro da listagem geral: lead comum continua visível. */
function visivelNaCarteira(lead: { baseFria: boolean; perdidoAt: Date | null }) {
  return lead.baseFria === false && lead.perdidoAt === null;
}

function podePuxar(lead: { baseFria: boolean; perdidoAt: Date | null }) {
  return lead.baseFria === true && lead.perdidoAt === null;
}

function podeDevolver(lead: { origemBaseFria: boolean; baseFria: boolean }) {
  return lead.origemBaseFria === true && lead.baseFria === false;
}

function podeApagar(lead: { baseFria: boolean }) {
  return lead.baseFria === true;
}

describe('leads frios não escondem a carteira', () => {
  it('lead que já existia continua na lista', () => {
    assert.equal(
      visivelNaCarteira({ baseFria: false, perdidoAt: null }),
      true,
    );
  });

  it('lead frio não entra na carteira nem no funil até ser puxado', () => {
    assert.equal(visivelNaCarteira({ baseFria: true, perdidoAt: null }), false);
    assert.equal(podePuxar({ baseFria: true, perdidoAt: null }), true);
  });

  it('depois de puxar, o lead volta a aparecer e não pode ser apagado da base', () => {
    const puxado = { baseFria: false, origemBaseFria: true, perdidoAt: null };
    assert.equal(visivelNaCarteira(puxado), true);
    assert.equal(podeApagar(puxado), false);
    assert.equal(podeDevolver(puxado), true);
  });

  it('lead comum não pode ser devolvido para a base fria', () => {
    assert.equal(
      podeDevolver({ origemBaseFria: false, baseFria: false }),
      false,
    );
  });

  it('apagar só alcança quem ainda está na base', () => {
    assert.equal(podeApagar({ baseFria: true }), true);
    assert.equal(podeApagar({ baseFria: false }), false);
    assert.equal(podePuxar({ baseFria: false, perdidoAt: null }), false);
  });
});
