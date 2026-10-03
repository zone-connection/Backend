import 'reflect-metadata';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import {
  BadRequestException,
  INestApplication,
  Module,
  ValidationError,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { CatalogService } from '../catalog/catalog.service';
import { FunisService } from '../funis/funis.service';
import { LeadNotifyService } from '../lead-notify/lead-notify.service';
import { PrismaService } from '../prisma/prisma.service';
import { GrupoZapController } from './grupozap.controller';
import {
  GrupoZapFeedController,
  GrupoZapWebhookController,
} from './grupozap-webhook.controller';
import { GrupoZapWebhookGuard } from './guards/grupozap-webhook.guard';
import { GrupoZapService } from './grupozap.service';

const SECRET = '594F803B380A41396ED63DCA39503542';
const TENANT_ID = 'tenant-1';
const ANUNCIANTE_ID = 'anunciante-1';
const IMOVEL_ID = '11111111-1111-4111-8111-111111111111';

const state = {
  secret: SECRET as string,
  connection: null as null | {
    id: string;
    tenantId: string;
    anuncianteId: string;
    ativo: boolean;
    displayAddress: string;
  },
  deliveries: new Set<string>(),
  leads: [] as { id: string; origem: string; tags: string[] }[],
  issues: [] as { imovelId: string; level: string; message: string }[],
};

function connectionByWhere(where: { tenantId?: string; anuncianteId?: string }) {
  if (!state.connection) return null;
  if (where.anuncianteId && state.connection.anuncianteId !== where.anuncianteId) {
    return null;
  }
  if (where.tenantId && state.connection.tenantId !== where.tenantId) return null;
  return state.connection;
}

const prisma = {
  tenantGrupoZapConnection: {
    findUnique: async ({ where }: { where: { tenantId?: string; anuncianteId?: string } }) =>
      connectionByWhere(where),
    create: async ({ data }: { data: { tenantId: string; anuncianteId: string; ativo: boolean } }) => {
      state.connection = {
        id: 'conn-1',
        displayAddress: 'Neighborhood',
        ...data,
      };
      return state.connection;
    },
    update: async ({ data }: { data: { ativo?: boolean; displayAddress?: string } }) => {
      state.connection = { ...state.connection!, ...data };
      return state.connection;
    },
    updateMany: async ({ data }: { data: { ativo: boolean } }) => {
      if (state.connection) state.connection.ativo = data.ativo;
      return { count: state.connection ? 1 : 0 };
    },
  },
  grupoZapWebhookDelivery: {
    findUnique: async ({ where }: { where: { originLeadId: string } }) =>
      state.deliveries.has(where.originLeadId) ? { id: 'delivery' } : null,
    create: async ({ data }: { data: { originLeadId: string } }) => {
      state.deliveries.add(data.originLeadId);
      return { id: 'delivery' };
    },
  },
  grupoZapImportReport: {
    upsert: async () => ({ id: 'report' }),
  },
  grupoZapListingIssue: {
    findMany: async () => state.issues,
    deleteMany: async () => {
      state.issues = [];
      return { count: 0 };
    },
    createMany: async ({
      data,
    }: {
      data: { imovelId: string; level: string; message: string }[];
    }) => {
      state.issues.push(...data);
      return { count: data.length };
    },
  },
  tenant: {
    findUnique: async () => ({
      name: 'Imobiliária Feliz',
      email: 'contato@imobiliariafeliz.com.br',
      telefone: '(81) 3333-4444',
      logoUrl: null,
      documento: '12345678000190',
    }),
    findMany: async () => [
      { id: TENANT_ID, documento: '12.345.678/0001-90' },
    ],
  },
  imovel: {
    findMany: async ({ where }: { where?: { id?: { in?: string[] } } }) => {
      if (where?.id?.in) {
        return where.id.in
          .filter((id) => id === IMOVEL_ID)
          .map((id) => ({ id, tenantId: TENANT_ID }));
      }
      return [];
    },
    findFirst: async () => null,
    findUnique: async () => null,
  },
  lead: {
    create: async ({
      data,
    }: {
      data: { origem: string; tags: string[]; nome: string };
    }) => {
      const lead = { id: `lead-${state.leads.length + 1}`, origem: data.origem, tags: data.tags };
      state.leads.push(lead);
      return { ...lead, nome: data.nome, telefone: '(11) 99999-9999', cidade: 'Recife' };
    },
  },
  leadGrupoZapLink: {
    create: async () => ({ id: 'link' }),
  },
  $transaction: async (input: unknown) => {
    if (typeof input === 'function') {
      return (input as (tx: typeof prisma) => Promise<unknown>)(prisma);
    }
    return Promise.all(input as Promise<unknown>[]);
  },
};

@Module({
  controllers: [
    GrupoZapController,
    GrupoZapWebhookController,
    GrupoZapFeedController,
  ],
  providers: [
    GrupoZapService,
    GrupoZapWebhookGuard,
    { provide: PrismaService, useValue: prisma },
    {
      provide: ConfigService,
      useValue: {
        get: (key: string) => {
          if (key === 'GRUPOZAP_SECRET_KEY') return state.secret;
          if (key === 'BACKEND_PUBLIC_URL') return 'https://crm.exemplo.com';
          return undefined;
        },
      },
    },
    {
      provide: CatalogService,
      useValue: {
        ensureOrigensForImport: async (_tenantId: string, labels: string[]) =>
          new Map(labels.map((label) => [label, label])),
      },
    },
    {
      provide: FunisService,
      useValue: {
        comercialPlacement: async () => ({ funilId: 'funil-1', stage: 'novo' }),
      },
    },
    {
      provide: LeadNotifyService,
      useValue: { notifyNewLead: async () => undefined },
    },
  ],
})
class GrupoZapHttpTestModule {}

function authHeader(secret = SECRET) {
  return `Basic ${Buffer.from(`vivareal:${secret}`).toString('base64')}`;
}

const adLead = {
  leadOrigin: 'Grupo OLX',
  originLeadId: '59ee0fc6e4b043e1b2a6d863',
  originListingId: '87027856',
  clientListingId: 'a40171',
  name: 'Nome Consumidor',
  email: 'nome.consumidor@email.com',
  ddd: '11',
  phone: '999999999',
  message: 'Olá, tenho interesse neste imóvel.',
  temperature: 'Alta',
  transactionType: 'SELL',
  campoNovoDaDocumentacao: 'nao-pode-rejeitar',
  extraData: { leadType: 'CONTACT_FORM', leadCerto: false },
};

describe('HTTP Grupo OLX', () => {
  let app: INestApplication;
  let base = '';

  before(async () => {
    app = await NestFactory.create(GrupoZapHttpTestModule, { logger: false });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        forbidUnknownValues: false,
        transform: true,
        exceptionFactory: (errors: ValidationError[]) =>
          new BadRequestException(errors.map((error) => Object.values(error.constraints ?? {})).flat()),
      }),
    );
    app.use((req: { headers: Record<string, string | undefined>; user?: unknown }, _res: unknown, next: () => void) => {
      if (req.headers['x-test-role'] === 'admin') {
        req.user = {
          id: 'user-1',
          role: 'admin',
          tenantId: TENANT_ID,
          permissions: null,
          tenantModules: null,
        };
      }
      next();
    });
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address();
    base = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    await app.close();
  });

  it('recusa webhook sem a SECRET_KEY e com chave errada', async () => {
    state.secret = '';
    const unavailable = await fetch(`${base}/api/grupozap/lead/${ANUNCIANTE_ID}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader() },
      body: JSON.stringify(adLead),
    });
    assert.equal(unavailable.status, 503);
    state.secret = SECRET;

    const denied = await fetch(`${base}/api/grupozap/lead/${ANUNCIANTE_ID}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader('chave-errada'),
      },
      body: JSON.stringify(adLead),
    });
    assert.equal(denied.status, 401);
  });

  it('responde 400 se o lead de anúncio não traz clientListingId', async () => {
    const response = await fetch(`${base}/api/grupozap/lead/${ANUNCIANTE_ID}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader() },
      body: JSON.stringify({ originLeadId: 'sem-anuncio', leadOrigin: 'Grupo OLX' }),
    });
    assert.equal(response.status, 400);
    const body = (await response.json()) as { message: string | string[] };
    const message = Array.isArray(body.message) ? body.message.join(' ') : body.message;
    assert.match(message, /clientListingId/);
  });

  it('cria o lead, ignora campo extra e trata o reenvio como duplicado', async () => {
    const headers = {
      'x-test-role': 'admin',
      'Content-Type': 'application/json',
    };
    const connected = await fetch(`${base}/api/integrations/grupozap/connect`, {
      method: 'POST',
      headers,
    });
    assert.equal(connected.status, 201);
    const status = (await connected.json()) as {
      connected: boolean;
      leadUrl: string;
      feedUrl: string;
      secretConfigured: boolean;
    };
    assert.equal(status.connected, true);
    assert.equal(status.secretConfigured, true);
    assert.equal(
      status.leadUrl,
      `https://crm.exemplo.com/api/grupozap/lead/${state.connection?.anuncianteId}`,
    );

    const anuncianteId = state.connection?.anuncianteId;
    const created = await fetch(`${base}/api/grupozap/lead/${anuncianteId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader() },
      body: JSON.stringify(adLead),
    });
    assert.equal(created.status, 200);
    const createdBody = (await created.json()) as { ok: boolean; leadId: string };
    assert.equal(createdBody.ok, true);
    assert.equal(state.leads.length, 1);
    assert.equal(state.leads[0]?.origem, 'Grupo OLX');
    assert.ok(state.leads[0]?.tags.includes('Formulário'));

    const duplicate = await fetch(`${base}/api/grupozap/lead/${anuncianteId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader() },
      body: JSON.stringify(adLead),
    });
    assert.equal(duplicate.status, 200);
    const duplicateBody = (await duplicate.json()) as { duplicate: boolean };
    assert.equal(duplicateBody.duplicate, true);
    assert.equal(state.leads.length, 1);
  });

  it('aceita lead MCMV sem anúncio na URL do anunciante', async () => {
    const response = await fetch(
      `${base}/api/grupozap/lead/${state.connection?.anuncianteId}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: authHeader() },
        body: JSON.stringify({
          leadOrigin: 'MCMV_OLX',
          originLeadId: 'mcmv-1',
          name: 'João da Silva',
          email: 'joao.silva@example.com',
          ddd: '11',
          phone: '987654321',
          temperature: 'Média',
          transactionType: 'SELL',
          extraData: { mcmv: { sellerDocument: '12345678000190', propertyValue: 250000 } },
        }),
      },
    );
    assert.equal(response.status, 200);
    assert.equal(state.leads.at(-1)?.origem, 'MCMV OLX');
    assert.ok(state.leads.at(-1)?.tags.includes('MCMV'));
  });

  it('publica o feed XML e esconde quando a conexão está inativa', async () => {
    const anuncianteId = state.connection?.anuncianteId;
    const feed = await fetch(`${base}/api/feeds/grupozap/${anuncianteId}`);
    assert.equal(feed.status, 200);
    assert.match(feed.headers.get('content-type') ?? '', /application\/xml/);
    const xml = await feed.text();
    assert.match(xml, /^<\?xml version="1.0" encoding="UTF-8"\?>/);
    assert.match(xml, /<ListingDataFeed xmlns="http:\/\/www\.vivareal\.com\/schemas\/1\.0\/VRSync"/);
    assert.match(xml, /<!\[CDATA\[NP Connect\]\]>/);

    const missing = await fetch(`${base}/api/feeds/grupozap/nao-existe`);
    assert.equal(missing.status, 404);

    const disconnected = await fetch(`${base}/api/integrations/grupozap/disconnect`, {
      method: 'POST',
      headers: { 'x-test-role': 'admin' },
    });
    assert.equal(disconnected.status, 201);
    const hidden = await fetch(`${base}/api/feeds/grupozap/${anuncianteId}`);
    assert.equal(hidden.status, 404);
    const rejectedLead = await fetch(`${base}/api/grupozap/lead/${anuncianteId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader() },
      body: JSON.stringify({ ...adLead, originLeadId: 'depois-de-desconectar' }),
    });
    assert.equal(rejectedLead.status, 400);
  });

  it('grava o relatório e liga a crítica ao ListingID', async () => {
    const response = await fetch(`${base}/api/grupozap/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader() },
      body: JSON.stringify({
        id: '625190f0-8b5a-4866-8eb2-0167d71a09a4',
        company: 'GRUPOZAP',
        type: 'FEEDS_INTEGRATION_REPORT',
        errors: [
          {
            errorMessage: 'O campo imagens é obrigatório',
            externalIds: [` ${IMOVEL_ID} `],
          },
        ],
        warnings: [],
      }),
    });
    assert.equal(response.status, 200);
    assert.equal(state.issues.length, 1);
    assert.equal(state.issues[0]?.imovelId, IMOVEL_ID);
    assert.equal(state.issues[0]?.level, 'error');
    assert.match(state.issues[0]?.message ?? '', /imagens/);

    const invalid = await fetch(`${base}/api/grupozap/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader() },
      body: JSON.stringify({ company: 'ZAP' }),
    });
    assert.equal(invalid.status, 400);
  });
});
