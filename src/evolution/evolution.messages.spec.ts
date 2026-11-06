import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  instanceNameForUser,
  leadWhatsappMessage,
  mapEvolutionState,
  parseEvolutionWebhook,
  readConnectionState,
  readQrBase64,
} from './evolution.messages';

describe('mensagem de lead no WhatsApp do corretor', () => {
  it('monta o texto sem telefone nem documento', () => {
    const text = leadWhatsappMessage({
      nomeCorretor: 'Ana',
      nomeLead: 'Carlos',
      interesse: 'Comprar',
      origem: 'Meta',
    });
    assert.match(text, /Olá, Ana!/);
    assert.match(text, /Lead: Carlos/);
    assert.match(text, /Interesse: Comprar/);
    assert.match(text, /Origem: Meta/);
    assert.equal(text.includes('119'), false);
  });
});

describe('instância por corretor', () => {
  it('gera um nome estável e sem hífen', () => {
    const name = instanceNameForUser('11111111-2222-3333-4444-555555555555');
    assert.equal(name.startsWith('zc'), true);
    assert.equal(name.includes('-'), false);
    assert.equal(instanceNameForUser('11111111-2222-3333-4444-555555555555'), name);
  });
});

describe('estado da Evolution', () => {
  it('traduz open, connecting e close', () => {
    assert.equal(mapEvolutionState('open'), 'connected');
    assert.equal(mapEvolutionState('connecting'), 'connecting');
    assert.equal(mapEvolutionState('close'), 'disconnected');
  });

  it('lê o QR Code e o estado da resposta', () => {
    assert.equal(readQrBase64({ qrcode: { base64: 'data:image/png;base64,abc' } }), 'data:image/png;base64,abc');
    assert.equal(readConnectionState({ instance: { state: 'open' } }), 'open');
  });
});

describe('webhook', () => {
  it('associa conexão e telefone à instância', () => {
    const update = parseEvolutionWebhook({
      event: 'CONNECTION_UPDATE',
      instance: 'zcabc',
      data: { state: 'open', wuid: '5581999999999@s.whatsapp.net' },
    });
    assert.deepEqual(update, {
      instanceName: 'zcabc',
      status: 'connected',
      phoneNumber: '5581999999999',
    });
  });

  it('ignora evento sem instância', () => {
    assert.equal(parseEvolutionWebhook({ event: 'CONNECTION_UPDATE' }), null);
  });

  it('ignora evento que não é de conexão', () => {
    assert.equal(
      parseEvolutionWebhook({ event: 'MESSAGES_UPSERT', instance: 'zcabc', data: {} }),
      null,
    );
  });
});
