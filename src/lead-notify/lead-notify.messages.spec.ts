import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  formatLeadWhatsApp,
  leadAtribuidoCopy,
  leadCrmPath,
  leadLoteCopy,
} from './lead-notify.messages';

describe('lead-notify messages', () => {
  it('monta texto curto com link do CRM', () => {
    const lead = {
      id: 'lead-1',
      nome: 'Ana Silva',
      telefone: '(11) 99999-8888',
      origem: 'Facebook Ads',
      cidade: 'São Paulo',
    };
    const copy = leadAtribuidoCopy(lead);
    const text = formatLeadWhatsApp({
      titulo: copy.whatsappTitulo,
      lead,
      crmUrl: `https://app.exemplo.com${leadCrmPath(lead.id)}`,
    });
    assert.match(text, /Novo lead atribuído a você/);
    assert.match(text, /Ana Silva/);
    assert.match(text, /funil\?lead=lead-1/);
  });

  it('agrupa distribuição', () => {
    assert.equal(leadLoteCopy(1).titulo, 'Você recebeu 1 lead novo');
    assert.equal(leadLoteCopy(5).titulo, 'Você recebeu 5 leads novos');
  });
});
