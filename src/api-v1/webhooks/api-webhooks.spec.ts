import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { describe, it } from 'node:test';
import {
  assinarEntrega,
  chaveWebhook,
  cifrarSegredo,
  corpoEvento,
  decifrarSegredo,
} from './webhook-crypto';
import {
  entregaEsgotada,
  eventoDeTransicaoStatus,
  imovelPublicoMudou,
  leadPublicoMudou,
  payloadEvento,
} from './webhook-eventos';
import { ipPrivado, validarUrlWebhook } from './webhook-ssrf';

const chave = randomBytes(32).toString('base64');

describe('webhooks', () => {
  it('cifra e recusa chave inválida', () => {
    const pacote = cifrarSegredo('segredo-parceiro', Buffer.from(chave, 'base64'));
    assert.equal(decifrarSegredo(pacote, Buffer.from(chave, 'base64')), 'segredo-parceiro');
    assert.throws(() => chaveWebhook('curta'));
    assert.throws(() => decifrarSegredo('quebrado', Buffer.from(chave, 'base64')));
  });

  it('assina os mesmos bytes do corpo', () => {
    const corpo = corpoEvento({
      id: 'evt-1',
      name: 'lead.created',
      occurredAt: '2026-11-07T16:00:00.000Z',
      data: { resourceId: 'lead-1', resourceType: 'lead' },
    });
    const assinatura = assinarEntrega('segredo', '2026-11-07T16:00:00.000Z', corpo);
    const esperado =
      'sha256=' +
      createHmac('sha256', 'segredo')
        .update(`2026-11-07T16:00:00.000Z.${corpo}`)
        .digest('hex');
    assert.equal(assinatura, esperado);
    assert.notEqual(assinarEntrega('outro', '2026-11-07T16:00:00.000Z', corpo), assinatura);
    assert.equal(corpo.includes('cpf'), false);
  });

  it('não repete available e só atualiza ficha pública', () => {
    assert.equal(eventoDeTransicaoStatus('reservado', 'disponivel'), 'property.available');
    assert.equal(eventoDeTransicaoStatus('disponivel', 'disponivel'), null);
    assert.equal(eventoDeTransicaoStatus('disponivel', 'vendido'), 'property.unavailable');
    assert.equal(eventoDeTransicaoStatus('reservado', 'vendido'), null);
    assert.equal(leadPublicoMudou({ nome: 'A' }, { nome: 'A' }), false);
    assert.equal(leadPublicoMudou({ nome: 'A' }, { nome: 'B' }), true);
    assert.equal(imovelPublicoMudou({ descricao: 'x' }, { descricao: 'x' }), false);
    assert.equal(imovelPublicoMudou({ descricao: 'x' }, { descricao: 'y' }), true);
    const payload = payloadEvento({
      id: 'e',
      nome: 'property.available',
      occurredAt: new Date('2026-11-07T16:00:00.000Z'),
      resourceId: 'venda-1',
      resourceType: 'property',
    });
    assert.deepEqual(Object.keys(payload.data), ['resourceId', 'resourceType']);
    assert.equal(entregaEsgotada(6), true);
    assert.equal(entregaEsgotada(5), false);
  });

  it('bloqueia destinos privados e redirecionamento não é seguido pela regra de IP', async () => {
    assert.equal(ipPrivado('127.0.0.1'), true);
    assert.equal(ipPrivado('10.1.1.1'), true);
    assert.equal(ipPrivado('192.168.0.8'), true);
    assert.equal(ipPrivado('169.254.169.254'), true);
    assert.equal(ipPrivado('::1'), true);
    assert.equal(ipPrivado('8.8.8.8'), false);
    await assert.rejects(() => validarUrlWebhook('http://parceiro.example/hook'));
    await assert.rejects(() =>
      validarUrlWebhook('https://localhost/hook', { lookup: async () => ['8.8.8.8'] }),
    );
    await assert.rejects(() =>
      validarUrlWebhook('https://127.0.0.1/hook', { lookup: async () => ['127.0.0.1'] }),
    );
    await assert.rejects(() =>
      validarUrlWebhook('https://metadata.example/hook', {
        lookup: async () => ['169.254.169.254'],
      }),
    );
    const ok = await validarUrlWebhook('https://parceiro.example/hook', {
      lookup: async () => ['8.8.8.8'],
    });
    assert.match(ok, /^https:\/\/parceiro\.example\/hook/);
  });
});
