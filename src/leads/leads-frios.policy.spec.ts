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

function podeEnviar(
  lead: { tipo: string; baseFria: boolean; perdidoAt: Date | null; corretorId: string | null },
  gestor: boolean,
  userId: string,
) {
  if (lead.tipo !== 'lead' || lead.baseFria || lead.perdidoAt) return false;
  return gestor || lead.corretorId === userId;
}

function paginaSegura(page: number, total: number, pageSize: number) {
  const last = Math.max(1, Math.ceil(total / pageSize));
  return Math.min(page, last);
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

  it('envio para a base aceita lead comum e recusa perdido, cliente e quem já está frio', () => {
    const comum = { tipo: 'lead', baseFria: false, perdidoAt: null, corretorId: 'c1' };
    assert.equal(podeEnviar(comum, true, 'admin'), true);
    assert.equal(podeEnviar(comum, false, 'c1'), true);
    assert.equal(podeEnviar(comum, false, 'outro'), false);
    assert.equal(podeEnviar({ ...comum, perdidoAt: new Date() }, true, 'admin'), false);
    assert.equal(podeEnviar({ ...comum, tipo: 'cliente' }, true, 'admin'), false);
    assert.equal(podeEnviar({ ...comum, baseFria: true }, true, 'admin'), false);
  });

  it('a página pedida não passa da última', () => {
    assert.equal(paginaSegura(1, 0, 20), 1);
    assert.equal(paginaSegura(1, 45, 20), 1);
    assert.equal(paginaSegura(9, 45, 20), 3);
    assert.equal(paginaSegura(2, 60, 50), 2);
  });

  it('apagar só alcança quem ainda está na base', () => {
    assert.equal(podeApagar({ baseFria: true }), true);
    assert.equal(podeApagar({ baseFria: false }), false);
    assert.equal(podePuxar({ baseFria: false, perdidoAt: null }), false);
  });
});
