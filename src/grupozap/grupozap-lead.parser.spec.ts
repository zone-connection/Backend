import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  formatGrupoZapPhone,
  leadRejectionReason,
  parseGrupoZapLead,
} from './grupozap-lead.parser';

const adLead = {
  leadOrigin: 'Grupo OLX',
  timestamp: '2017-10-23T15:50:30.619Z',
  originLeadId: '59ee0fc6e4b043e1b2a6d863',
  originListingId: '87027856',
  clientListingId: 'a40171',
  name: 'Nome Consumidor',
  email: 'nome.consumidor@email.com',
  ddd: '11',
  phone: '999999999',
  phoneNumber: '11999999999',
  message: 'Olá, tenho interesse neste imóvel.',
  temperature: 'Alta',
  transactionType: 'SELL',
  extraData: {
    leadCerto: true,
    izi: 'https://lead-conversation.grupozap.com/lead/x',
    feedback: 'https://feedback-lead.grupozap.com/integration/x',
    leadType: 'CONTACT_CHAT',
  },
};

describe('webhook de leads Grupo OLX', () => {
  it('exige clientListingId em lead de anúncio e aceita MCMV sem ele', () => {
    assert.equal(leadRejectionReason({ originLeadId: '1' }), 'clientListingId ausente.');
    assert.equal(
      leadRejectionReason({ originLeadId: '1', leadOrigin: 'MCMV_OLX' }),
      null,
    );
    assert.equal(leadRejectionReason({ clientListingId: 'a' }), 'originLeadId ausente.');
    assert.equal(leadRejectionReason(adLead), null);
  });

  it('monta o telefone com ddd + phone e mapeia temperatura e canal', () => {
    const lead = parseGrupoZapLead(adLead);
    assert.equal(formatGrupoZapPhone('11', '999999999', ''), '(11) 99999-9999');
    assert.equal(lead.phone, '(11) 99999-9999');
    assert.equal(lead.prioridade, 'Alta');
    assert.equal(lead.interesse, 'Comprar');
    assert.equal(lead.leadTypeLabel, 'Chat');
    assert.equal(lead.leadCerto, true);
    assert.equal(lead.clientListingId, 'a40171');
  });

  it('trata simulação MCMV como lead sem anúncio', () => {
    const lead = parseGrupoZapLead({
      leadOrigin: 'MCMV_OLX',
      originLeadId: 'mcmv-1',
      name: 'João da Silva',
      email: 'joao.silva@example.com',
      ddd: '11',
      phone: '987654321',
      message: 'Simulação de financiamento MCMV realizada no portal.',
      temperature: 'Média',
      transactionType: 'SELL',
      extraData: {
        mcmv: {
          sellerDocument: '12345678000190',
          unitType: 'APARTMENT',
          propertyLocation: { state: 'SP', city: 'São Paulo' },
          propertyValue: 250000,
          subsidyRange: 'FAIXA_1',
          urgencyToBuy: 'ALTA',
        },
      },
    });
    assert.equal(lead.isMcmv, true);
    assert.equal(lead.mcmv?.sellerDocument, '12345678000190');
    assert.equal(lead.mcmv?.city, 'São Paulo');
    assert.equal(lead.mcmv?.propertyValue, 250000);
    assert.equal(lead.prioridade, 'Média');
  });

  it('marca aluguel e usa phoneNumber só quando ddd e phone não fecham', () => {
    const lead = parseGrupoZapLead({
      ...adLead,
      ddd: '',
      phone: '',
      phoneNumber: '11988887777',
      transactionType: 'RENT',
      temperature: 'Baixa',
    });
    assert.equal(lead.phone, '(11) 98888-7777');
    assert.equal(lead.interesse, 'Alugar');
    assert.equal(lead.prioridade, 'Baixa');
  });
});
