import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { createHmac, randomBytes } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import { ApiAccessGuard } from '../api-access.guard';
import { API_SCOPES_KEY } from '../api-context';
import {
  WebhookDestinosService,
  WebhookEntregaService,
  WebhookEventosService,
  enviarHttp,
} from './webhooks.service';

const banco = process.env.WEBHOOK_TEST_DATABASE_URL;
const chave = randomBytes(32).toString('base64');

describe('webhooks no PostgreSQL local', { skip: !banco }, () => {
  const prisma = new PrismaClient({ datasources: { db: { url: banco } } });
  const destinos = new WebhookDestinosService(prisma as never);
  const eventos = new WebhookEventosService(prisma as never);
  const entregas = new WebhookEntregaService(prisma as never);
  let servidor: Server;
  let porta = 0;
  const recebidos: Array<{ status: number; body: string; headers: Record<string, string | string[] | undefined> }> = [];
  let resposta: { status: number; espera: number } = { status: 200, espera: 0 };

  before(async () => {
    process.env.WEBHOOK_ENCRYPTION_KEY = chave;
    process.env.WEBHOOK_ALLOW_HTTP = 'true';
    process.env.NODE_ENV = 'test';
    await prisma.$connect();
    servidor = createServer((req, res) => {
      const partes: Buffer[] = [];
      req.on('data', (parte) => partes.push(parte));
      req.on('end', () => {
        const body = Buffer.concat(partes).toString('utf8');
        recebidos.push({
          status: resposta.status,
          body,
          headers: req.headers,
        });
        setTimeout(() => {
          res.writeHead(resposta.status);
          res.end('ok');
        }, resposta.espera);
      });
    });
    await new Promise<void>((resolve) => servidor.listen(0, '127.0.0.1', resolve));
    porta = (servidor.address() as { port: number }).port;
  });

  after(async () => {
    servidor?.close();
    await prisma.apiWebhookTentativa.deleteMany();
    await prisma.apiWebhookEntrega.deleteMany();
    await prisma.apiWebhookEvento.deleteMany();
    await prisma.apiWebhookDestino.deleteMany();
    await prisma.apiAutorizacao.deleteMany();
    await prisma.apiAplicacao.deleteMany();
    await prisma.tenant.deleteMany({ where: { slug: { startsWith: 'webhook-teste-' } } });
    await prisma.$disconnect();
  });

  it('valida tabelas, chaves e índices', async () => {
    const tabelas = await prisma.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename LIKE 'api_webhook%'
      ORDER BY tablename
    `;
    assert.deepEqual(tabelas.map((t) => t.tablename), [
      'api_webhook_destinos',
      'api_webhook_entregas',
      'api_webhook_eventos',
      'api_webhook_tentativas',
    ]);
    const indices = await prisma.$queryRaw<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public' AND tablename LIKE 'api_webhook%'
    `;
    const nomes = indices.map((i) => i.indexname);
    assert.ok(nomes.includes('api_webhook_entregas_eventoId_destinoId_key'));
    assert.ok(nomes.includes('api_webhook_entregas_estado_proximaTentativaEm_idx'));
    assert.ok(nomes.includes('api_webhook_eventos_processadoEm_createdAt_idx'));
    const fks = await prisma.$queryRaw<{ conname: string }[]>`
      SELECT conname FROM pg_constraint
      WHERE contype = 'f' AND conname LIKE 'api_webhook%'
    `;
    assert.ok(fks.length >= 5);
  });

  it('exige o scope e isola tenant e aplicação', async () => {
    const guard = new ApiAccessGuard(
      {
        authenticate: async (token: string) => {
          if (token === 'ruim') throw new UnauthorizedException('token inválido');
          return {
            appId: 'app',
            sub: 'client',
            tenantId: 'tenant',
            jti: 'jti',
            scopes: token === 'sem' ? ['leads:read'] : ['webhooks:manage'],
          };
        },
      } as never,
      new Reflector(),
    );
    const contexto = (authorization?: string) => {
      const handler = function rota() {};
      Reflect.defineMetadata(API_SCOPES_KEY, ['webhooks:manage'], handler);
      return {
        switchToHttp: () => ({
          getRequest: () => ({ header: () => authorization ?? '' }),
        }),
        getHandler: () => handler,
        getClass: () => class Controle {},
      } as unknown as ExecutionContext;
    };
    await assert.rejects(() => guard.canActivate(contexto()), UnauthorizedException);
    await assert.rejects(() => guard.canActivate(contexto('Bearer ruim')), UnauthorizedException);
    await assert.rejects(() => guard.canActivate(contexto('Bearer sem')), ForbiddenException);
    assert.equal(await guard.canActivate(contexto('Bearer ok')), true);

    const tenantA = await prisma.tenant.create({ data: { name: 'A', slug: 'webhook-teste-a' } });
    const tenantB = await prisma.tenant.create({ data: { name: 'B', slug: 'webhook-teste-b' } });
    const appA = await prisma.apiAplicacao.create({
      data: { nome: 'A', clientId: `wh-a-${Date.now()}`, segredoHash: 'hash' },
    });
    const appB = await prisma.apiAplicacao.create({
      data: { nome: 'B', clientId: `wh-b-${Date.now()}`, segredoHash: 'hash' },
    });
    const criado = await destinos.criar(tenantA.id, appA.id, `http://127.0.0.1:${porta}/hook`, ['lead.created']);
    assert.ok(criado.secret);
    const lista = await destinos.listar(tenantA.id, appA.id);
    assert.equal(JSON.stringify(lista).includes(criado.secret), false);
    assert.equal(lista[0]?.events[0], 'lead.created');
    await assert.rejects(() => destinos.obter(tenantA.id, appB.id, criado.id));
    await assert.rejects(() => destinos.obter(tenantB.id, appA.id, criado.id));
    await assert.rejects(() => destinos.rotacionar(tenantA.id, appB.id, criado.id));
  });

  it('grava o evento na mesma transação e desfaz se ela falhar', async () => {
    const tenant = await prisma.tenant.findFirstOrThrow({ where: { slug: 'webhook-teste-a' } });
    const antes = await prisma.apiWebhookEvento.count({ where: { tenantId: tenant.id } });
    await assert.rejects(
      prisma.$transaction(async (tx) => {
        await tx.tenant.update({ where: { id: tenant.id }, data: { name: 'nao-deve-ficar' } });
        await eventos.gravar(tx, {
          tenantId: tenant.id,
          nome: 'lead.created',
          resourceId: 'lead-rollback',
          resourceType: 'lead',
        });
        throw new Error('falha proposital');
      }),
    );
    const depois = await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } });
    assert.notEqual(depois.name, 'nao-deve-ficar');
    assert.equal(await prisma.apiWebhookEvento.count({ where: { tenantId: tenant.id } }), antes);

    await prisma.$transaction(async (tx) => {
      await eventos.gravar(tx, {
        tenantId: tenant.id,
        nome: 'lead.created',
        resourceId: 'lead-ok',
        resourceType: 'lead',
      });
    });
    const salvo = await prisma.apiWebhookEvento.findFirstOrThrow({
      where: { tenantId: tenant.id, resourceId: 'lead-ok' },
    });
    assert.equal(salvo.nome, 'lead.created');
    assert.equal((salvo.payload as { data: { resourceType: string } }).data.resourceType, 'lead');
  });

  it('entrega, assina, registra tentativas, retenta e respeita o lease', async () => {
    const tenant = await prisma.tenant.findFirstOrThrow({ where: { slug: 'webhook-teste-a' } });
    const app = await prisma.apiAplicacao.findFirstOrThrow({ where: { nome: 'A' } });
    await prisma.apiWebhookDestino.updateMany({ data: { ativo: false } });
    const destino = await destinos.criar(tenant.id, app.id, `http://127.0.0.1:${porta}/hook`, ['lead.created']);
    await prisma.$transaction((tx) =>
      eventos.gravar(tx, {
        tenantId: tenant.id,
        nome: 'lead.created',
        resourceId: 'lead-http',
        resourceType: 'lead',
      }),
    );
    await entregas.publicarEventosPendentes();
    resposta = { status: 429, espera: 0 };
    await entregas.processarEntregas(new Date(Date.now() + 2000), enviarHttp);
    const primeira = recebidos.at(-1)!;
    const corpo = primeira.body;
    const timestamp = String(primeira.headers['x-zone-timestamp']);
    const assinatura = String(primeira.headers['x-zone-signature']);
    const esperada = `sha256=${createHmac('sha256', destino.secret).update(`${timestamp}.${corpo}`).digest('hex')}`;
    assert.equal(assinatura, esperada);
    assert.equal(primeira.headers['x-zone-event'], 'lead.created');
    assert.equal(corpo.includes('cpf'), false);
    let entrega = await prisma.apiWebhookEntrega.findFirstOrThrow({ where: { destinoId: destino.id } });
    assert.equal(entrega.estado, 'pendente');
    assert.equal(entrega.tentativas, 1);
    assert.equal(await prisma.apiWebhookTentativa.count({ where: { entregaId: entrega.id } }), 1);

    const reservada = await prisma.apiWebhookEntrega.create({
      data: {
        eventoId: entrega.eventoId,
        destinoId: (await destinos.criar(tenant.id, app.id, `http://127.0.0.1:${porta}/outra`, ['lead.created'])).id,
        tenantId: tenant.id,
        reservadoAte: new Date(Date.now() + 60_000),
      },
    });
    const antes = recebidos.length;
    await entregas.processarEntregas(new Date(), enviarHttp);
    assert.equal(recebidos.length, antes);
    await prisma.apiWebhookEntrega.update({
      where: { id: reservada.id },
      data: { reservadoAte: new Date(Date.now() - 1000), estado: 'cancelada' },
    });

    resposta = { status: 200, espera: 0 };
    await entregas.processarEntregas(new Date(Date.now() + 120_000), enviarHttp);
    entrega = await prisma.apiWebhookEntrega.findUniqueOrThrow({ where: { id: entrega.id } });
    assert.equal(entrega.estado, 'entregue');
    assert.equal(await prisma.apiWebhookTentativa.count({ where: { entregaId: entrega.id } }), 2);

    const lento = await destinos.criar(tenant.id, app.id, `http://127.0.0.1:${porta}/lento`, ['lead.updated']);
    await prisma.$transaction((tx) =>
      eventos.gravar(tx, {
        tenantId: tenant.id,
        nome: 'lead.updated',
        resourceId: 'lead-lease',
        resourceType: 'lead',
      }),
    );
    await entregas.publicarEventosPendentes();
    resposta = { status: 200, espera: 400 };
    let chamadas = 0;
    const enviarLento: typeof enviarHttp = async (url, body, headers) => {
      chamadas += 1;
      await new Promise((resolve) => setTimeout(resolve, 400));
      return enviarHttp(url, body, headers);
    };
    const relogio = new Date(Date.now() + 2000);
    await Promise.all([
      entregas.processarEntregas(relogio, enviarLento, 30_000),
      entregas.processarEntregas(relogio, enviarLento, 30_000),
    ]);
    assert.equal(chamadas, 1);
    const concluida = await prisma.apiWebhookEntrega.findFirstOrThrow({ where: { destinoId: lento.id } });
    assert.equal(concluida.estado, 'entregue');

    const falho = await destinos.criar(tenant.id, app.id, `http://127.0.0.1:${porta}/falha`, ['property.updated']);
    await prisma.$transaction((tx) =>
      eventos.gravar(tx, {
        tenantId: tenant.id,
        nome: 'property.updated',
        resourceId: 'venda-1',
        resourceType: 'property',
      }),
    );
    await entregas.publicarEventosPendentes();
    resposta = { status: 500, espera: 0 };
    await entregas.processarEntregas(new Date(Date.now() + 2000), enviarHttp);
    const girado = await destinos.rotacionar(tenant.id, app.id, falho.id);
    resposta = { status: 200, espera: 0 };
    await entregas.processarEntregas(new Date(Date.now() + 120_000), enviarHttp);
    const ultima = recebidos.at(-1)!;
    const nova = `sha256=${createHmac('sha256', girado.secret).update(`${ultima.headers['x-zone-timestamp']}.${ultima.body}`).digest('hex')}`;
    assert.equal(ultima.headers['x-zone-signature'], nova);

    const pendente = await destinos.criar(tenant.id, app.id, `http://127.0.0.1:${porta}/off`, ['property.available']);
    await prisma.$transaction((tx) =>
      eventos.gravar(tx, {
        tenantId: tenant.id,
        nome: 'property.available',
        resourceId: 'venda-2',
        resourceType: 'property',
      }),
    );
    await entregas.publicarEventosPendentes();
    await destinos.desativar(tenant.id, app.id, pendente.id);
    const cancelada = await prisma.apiWebhookEntrega.findFirstOrThrow({ where: { destinoId: pendente.id } });
    assert.equal(cancelada.estado, 'cancelada');

    await assert.rejects(() => enviarHttp('http://127.0.0.1:9/fechada', '{}', {}));
  });
});
