import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { OzapApiClient, OzapApiError } from './ozap-api.client';

describe('OzapApiClient.sendText', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('POST no endpoint de mensagens do chat', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response('{}', { status: 200 });
    }) as typeof fetch;

    const client = new OzapApiClient({
      get: (key: string) => (key === 'OZAP_API_KEY' ? 'test-key' : undefined),
    } as never);

    await client.sendText({
      instanceId: 1143,
      to: '(11) 99999-8888',
      text: 'Novo lead',
    });

    assert.equal(calls.length, 1);
    assert.equal(
      calls[0]!.url,
      'https://api.ozaponline.com/api/v1/1143/chats/5511999998888/messages',
    );
    assert.equal(
      (calls[0]!.init.headers as Record<string, string>).Authorization,
      'Bearer test-key',
    );
    assert.equal(calls[0]!.init.body, JSON.stringify({ content: 'Novo lead' }));
  });

  it('cai no fallback /messages quando o chat retorna 404', async () => {
    const urls: string[] = [];
    globalThis.fetch = (async (url: string | URL) => {
      urls.push(String(url));
      if (urls.length === 1) return new Response('not found', { status: 404 });
      return new Response('{}', { status: 200 });
    }) as typeof fetch;

    const client = new OzapApiClient({
      get: (key: string) => (key === 'OZAP_API_KEY' ? 'test-key' : undefined),
    } as never);

    await client.sendText({
      instanceId: 1143,
      to: '11999998888',
      text: 'Oi',
    });

    assert.deepEqual(urls, [
      'https://api.ozaponline.com/api/v1/1143/chats/5511999998888/messages',
      'https://api.ozaponline.com/api/v1/1143/messages',
    ]);
  });

  it('GET lista mensagens do chat', async () => {
    globalThis.fetch = (async (url: string | URL) => {
      assert.equal(
        String(url),
        'https://api.ozaponline.com/api/v1/1143/chats/5511999998888/messages',
      );
      return new Response(
        JSON.stringify({
          data: [
            {
              id: '1',
              content: 'Oi',
              direction: 'in',
              timestamp: '2026-10-12T12:00:00.000Z',
            },
            {
              id: '2',
              content: 'Qual sua renda?',
              source: 'ai',
              timestamp: '2026-10-12T12:01:00.000Z',
            },
          ],
        }),
        { status: 200 },
      );
    }) as typeof fetch;

    const client = new OzapApiClient({
      get: (key: string) => (key === 'OZAP_API_KEY' ? 'test-key' : undefined),
    } as never);

    const messages = await client.listMessages({
      instanceId: 1143,
      chatId: '5511999998888',
    });
    assert.equal(messages.length, 2);
    assert.equal(messages[0]!.direction, 'in');
    assert.equal(messages[1]!.direction, 'out');
    assert.equal(messages[1]!.text, 'Qual sua renda?');
  });

  it('recusa número inválido', async () => {
    const client = new OzapApiClient({
      get: (key: string) => (key === 'OZAP_API_KEY' ? 'test-key' : undefined),
    } as never);
    await assert.rejects(
      () => client.sendText({ instanceId: 1, to: '123', text: 'x' }),
      OzapApiError,
    );
  });
});
