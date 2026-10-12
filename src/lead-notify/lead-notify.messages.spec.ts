import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  formatLeadEmailHtml,
  formatLeadWhatsApp,
  leadAtribuidoCopy,
  leadCrmPath,
  leadLoteCopy,
  pickPublicFrontendUrl,
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

  it('escolhe o domínio público do CRM, não o preview da Vercel', () => {
    assert.equal(
      pickPublicFrontendUrl(
        'http://localhost:8080,https://frontend-seven-wine-46.vercel.app,https://www.zoneconnection.com.br',
      ),
      'https://www.zoneconnection.com.br',
    );
    assert.equal(
      pickPublicFrontendUrl(
        'https://frontend-seven-wine-46.vercel.app',
        'https://zoneconnection.com.br',
      ),
      'https://www.zoneconnection.com.br',
    );
    assert.equal(
      pickPublicFrontendUrl('https://frontend-seven-wine-46.vercel.app'),
      'https://www.zoneconnection.com.br',
    );
  });

  it('monta HTML com logo e botão do CRM', () => {
    const html = formatLeadEmailHtml({
      titulo: 'Novo lead atribuído a você',
      lead: {
        id: 'lead-1',
        nome: 'Ana Silva',
        telefone: '(11) 99999-8888',
        origem: 'Facebook Ads',
        cidade: 'São Paulo',
      },
      crmUrl: 'https://www.zoneconnection.com.br/funil?lead=lead-1',
      brandName: 'Imobiliária Campinas',
      logoUrl: 'https://cdn.exemplo.com/logo.png',
    });
    assert.match(html, /cdn\.exemplo.com\/logo\.png/);
    assert.match(html, /www\.zoneconnection\.com\.br\/funil\?lead=lead-1/);
    assert.match(html, /Imobiliária Campinas/);
  });

  it('agrupa distribuição', () => {
    assert.equal(leadLoteCopy(1).titulo, 'Você recebeu 1 lead novo');
    assert.equal(leadLoteCopy(5).titulo, 'Você recebeu 5 leads novos');
  });
});
