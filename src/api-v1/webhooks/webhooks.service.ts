import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  assinarEntrega,
  cifrarSegredo,
  decifrarSegredo,
  gerarSegredoWebhook,
} from './webhook-crypto';
import {
  eventoValido,
  payloadEvento,
  proximaTentativa,
  entregaEsgotada,
  type WebhookEventoNome,
} from './webhook-eventos';
import { destinoFixado, validarUrlWebhook } from './webhook-ssrf';
import http from 'http';
import https from 'https';

type Tx = Prisma.TransactionClient | PrismaService;

const TIMEOUT_MS = Number(process.env.WEBHOOK_HTTP_TIMEOUT_MS ?? 5000);

@Injectable()
export class WebhookEventosService {
  constructor(private readonly prisma: PrismaService) {}

  async gravar(
    tx: Tx,
    input: {
      tenantId: string;
      nome: WebhookEventoNome;
      resourceId: string;
      resourceType: 'lead' | 'property';
      occurredAt?: Date;
    },
  ) {
    const id = randomUUID();
    const occurredAt = input.occurredAt ?? new Date();
    const payload = payloadEvento({
      id,
      nome: input.nome,
      occurredAt,
      resourceId: input.resourceId,
      resourceType: input.resourceType,
    });
    await tx.apiWebhookEvento.create({
      data: {
        id,
        tenantId: input.tenantId,
        nome: input.nome,
        resourceId: input.resourceId,
        resourceType: input.resourceType,
        occurredAt,
        payload,
      },
    });
    return payload;
  }
}

@Injectable()
export class WebhookDestinosService {
  constructor(private readonly prisma: PrismaService) {}

  private httpLiberado() {
    return process.env.WEBHOOK_ALLOW_HTTP === 'true' && process.env.NODE_ENV === 'test';
  }

  private async urlAceita(url: string) {
    try {
      return await validarUrlWebhook(url, {
        allowHttp: this.httpLiberado(),
        allowLoopback: this.httpLiberado(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'URL inválida.';
      throw new BadRequestException(message);
    }
  }

  async criar(tenantId: string, aplicacaoId: string, url: string, eventos: string[]) {
    this.validarEventos(eventos);
    const destinoUrl = await this.urlAceita(url);
    const segredo = gerarSegredoWebhook();
    const row = await this.prisma.apiWebhookDestino.create({
      data: {
        tenantId,
        aplicacaoId,
        url: destinoUrl,
        eventos,
        segredoCifrado: cifrarSegredo(segredo),
      },
    });
    return { ...this.publico(row), secret: segredo };
  }

  listar(tenantId: string, aplicacaoId: string) {
    return this.prisma.apiWebhookDestino
      .findMany({
        where: { tenantId, aplicacaoId },
        orderBy: { createdAt: 'desc' },
      })
      .then((rows) => rows.map((row) => this.publico(row)));
  }

  async obter(tenantId: string, aplicacaoId: string, id: string) {
    const row = await this.buscar(tenantId, aplicacaoId, id);
    return this.publico(row);
  }

  async atualizar(
    tenantId: string,
    aplicacaoId: string,
    id: string,
    patch: { url?: string; events?: string[]; active?: boolean },
  ) {
    await this.buscar(tenantId, aplicacaoId, id);
    if (patch.events) this.validarEventos(patch.events);
    const url = patch.url ? await this.urlAceita(patch.url) : undefined;
    const row = await this.prisma.apiWebhookDestino.update({
      where: { id },
      data: {
        ...(url ? { url } : {}),
        ...(patch.events ? { eventos: patch.events } : {}),
        ...(patch.active === undefined
          ? {}
          : {
              ativo: patch.active,
              desativadoEm: patch.active ? null : new Date(),
            }),
      },
    });
    if (patch.active === false) await this.cancelarPendentes(id);
    return this.publico(row);
  }

  async desativar(tenantId: string, aplicacaoId: string, id: string) {
    await this.buscar(tenantId, aplicacaoId, id);
    const row = await this.prisma.apiWebhookDestino.update({
      where: { id },
      data: { ativo: false, desativadoEm: new Date() },
    });
    await this.cancelarPendentes(id);
    return this.publico(row);
  }

  async rotacionar(tenantId: string, aplicacaoId: string, id: string) {
    await this.buscar(tenantId, aplicacaoId, id);
    const segredo = gerarSegredoWebhook();
    await this.prisma.apiWebhookDestino.update({
      where: { id },
      data: { segredoCifrado: cifrarSegredo(segredo) },
    });
    return { id, secret: segredo };
  }

  private async buscar(tenantId: string, aplicacaoId: string, id: string) {
    const row = await this.prisma.apiWebhookDestino.findFirst({
      where: { id, tenantId, aplicacaoId },
    });
    if (!row) throw new NotFoundException('Destino de webhook não encontrado.');
    return row;
  }

  private validarEventos(eventos: string[]) {
    if (!eventos.length || eventos.some((nome) => !eventoValido(nome))) {
      throw new BadRequestException('Lista de eventos inválida.');
    }
  }

  private async cancelarPendentes(destinoId: string) {
    await this.prisma.apiWebhookEntrega.updateMany({
      where: { destinoId, estado: 'pendente' },
      data: { estado: 'cancelada', concluidaEm: new Date(), ultimoErro: 'destino desativado' },
    });
  }

  private publico(row: {
    id: string;
    url: string;
    eventos: string[];
    ativo: boolean;
    createdAt: Date;
    updatedAt: Date;
    desativadoEm: Date | null;
  }) {
    return {
      id: row.id,
      url: row.url,
      events: row.eventos,
      active: row.ativo,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      disabledAt: row.desativadoEm?.toISOString() ?? null,
    };
  }
}

@Injectable()
export class WebhookEntregaService {
  constructor(private readonly prisma: PrismaService) {}

  async publicarEventosPendentes() {
    const eventos = await this.prisma.apiWebhookEvento.findMany({
      where: { processadoEm: null },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });
    for (const evento of eventos) {
      const destinos = await this.prisma.apiWebhookDestino.findMany({
        where: {
          tenantId: evento.tenantId,
          ativo: true,
          eventos: { has: evento.nome },
        },
      });
      for (const destino of destinos) {
        await this.prisma.apiWebhookEntrega.createMany({
          data: [{
            eventoId: evento.id,
            destinoId: destino.id,
            tenantId: evento.tenantId,
          }],
          skipDuplicates: true,
        });
      }
      await this.prisma.apiWebhookEvento.update({
        where: { id: evento.id },
        data: { processadoEm: new Date() },
      });
    }
  }

  async processarEntregas(agora = new Date(), enviar = enviarHttp, leaseMs = Number(process.env.WEBHOOK_LEASE_MS ?? TIMEOUT_MS + 15000)) {
    const reservadoAte = new Date(agora.getTime() + leaseMs);
    const pendentes = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM api_webhook_entregas
        WHERE estado::text = 'pendente'
          AND "proximaTentativaEm" <= ${relogioUtc(agora)}::timestamp
          AND ("reservadoAte" IS NULL OR "reservadoAte" <= ${relogioUtc(agora)}::timestamp)
        ORDER BY "proximaTentativaEm" ASC
        LIMIT 10
        FOR UPDATE SKIP LOCKED
      `;
      if (rows.length) {
        await tx.apiWebhookEntrega.updateMany({
          where: { id: { in: rows.map((row) => row.id) } },
          data: { reservadoAte },
        });
      }
      return rows;
    });
    for (const item of pendentes) {
      await this.tentar(item.id, agora, enviar);
    }
  }

  private async tentar(
    entregaId: string,
    agora: Date,
    enviar: typeof enviarHttp,
  ) {
    const entrega = await this.prisma.apiWebhookEntrega.findUnique({
      where: { id: entregaId },
      include: { evento: true, destino: true },
    });
    if (!entrega || entrega.estado !== 'pendente') return;
    if (!entrega.destino.ativo) {
      await this.prisma.apiWebhookEntrega.update({
        where: { id: entrega.id },
        data: { estado: 'cancelada', concluidaEm: agora, ultimoErro: 'destino desativado' },
      });
      return;
    }
    const numero = entrega.tentativas + 1;
    const inicio = Date.now();
    const corpo = JSON.stringify(entrega.evento.payload);
    const timestamp = agora.toISOString();
    let httpStatus: number | null = null;
    let erro = '';
    let sucesso = false;
    try {
      const segredo = decifrarSegredo(entrega.destino.segredoCifrado);
      const resposta = await enviar(entrega.destino.url, corpo, {
        'Content-Type': 'application/json',
        'X-Zone-Event-Id': entrega.evento.id,
        'X-Zone-Event': entrega.evento.nome,
        'X-Zone-Timestamp': timestamp,
        'X-Zone-Signature': assinarEntrega(segredo, timestamp, corpo),
      });
      httpStatus = resposta.status;
      sucesso = resposta.status >= 200 && resposta.status < 300;
      if (!sucesso) erro = `http ${resposta.status}`;
    } catch (error) {
      erro = sanitizarErro(error);
    }
    const duracaoMs = Date.now() - inicio;
    await this.prisma.apiWebhookTentativa.create({
      data: {
        entregaId: entrega.id,
        numero,
        httpStatus,
        duracaoMs,
        sucesso,
        erro: erro.slice(0, 300),
      },
    });
    const esgotou = !sucesso && entregaEsgotada(numero);
    const retenta = !sucesso && !esgotou && httpRetentavel(httpStatus);
    await this.prisma.apiWebhookEntrega.update({
      where: { id: entrega.id },
      data: {
        tentativas: numero,
        ultimoHttp: httpStatus,
        ultimoErro: erro.slice(0, 300),
        ultimaTentativaEm: agora,
        estado: sucesso ? 'entregue' : esgotou || !retenta ? 'falhou' : 'pendente',
        concluidaEm: sucesso || esgotou || !retenta ? agora : null,
        proximaTentativaEm: sucesso || esgotou || !retenta ? agora : proximaTentativa(numero, agora),
        reservadoAte: null,
      },
    });
  }
}

function relogioUtc(data: Date) {
  return data.toISOString().replace('T', ' ').replace('Z', '');
}

function httpRetentavel(status: number | null) {
  if (status == null) return true;
  if (status === 408 || status === 429) return true;
  return status >= 500;
}

function sanitizarErro(error: unknown) {
  const texto = error instanceof Error ? error.message : 'falha de entrega';
  return texto.replace(/https?:\/\/\S+/g, '[url]').slice(0, 300);
}

export async function enviarHttp(
  url: string,
  body: string,
  headers: Record<string, string>,
) {
  const teste = process.env.WEBHOOK_ALLOW_HTTP === 'true' && process.env.NODE_ENV === 'test';
  const destino = await destinoFixado(url, { allowHttp: teste, allowLoopback: teste });
  const lib = destino.protocol === 'https:' ? https : http;
  return new Promise<{ status: number }>((resolve, reject) => {
    const req = lib.request(
      {
        protocol: destino.protocol,
        hostname: destino.hostname,
        servername: destino.hostname,
        port: destino.port || undefined,
        path: destino.path,
        method: 'POST',
        headers: { ...headers, 'content-length': Buffer.byteLength(body) },
        timeout: TIMEOUT_MS,
        lookup: (hostname, options, callback) => {
          const pronto = typeof options === 'function' ? options : callback;
          const todos = typeof options === 'object' && options?.all === true;
          if (todos) pronto(null, [{ address: destino.address, family: destino.family }]);
          else pronto(null, destino.address, destino.family);
          void hostname;
        },
      },
      (resposta) => {
        resposta.resume();
        resposta.on('end', () => resolve({ status: resposta.statusCode ?? 0 }));
      },
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.end(body);
  });
}
