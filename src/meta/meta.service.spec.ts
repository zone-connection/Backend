import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Prisma } from '@prisma/client';
import { MetaService } from './meta.service';
import type { MetaGraphApiService } from './meta-graph-api.service';

const PAGE_ID = '1171170866089778';
const TENANT_ID = 'tenant-zone-1';
const LEADGEN_ID = 'leadgen-real-1';

function p2002() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

function payload(pageId = PAGE_ID, leadgenId = LEADGEN_ID) {
  return {
    object: 'page',
    entry: [
      {
        id: pageId,
        changes: [
          {
            field: 'leadgen',
            value: {
              leadgen_id: leadgenId,
              page_id: pageId,
              form_id: 'form-1',
              campaign_id: 'should-not-break',
            },
          },
        ],
      },
    ],
  };
}

function createService(opts: {
  connection?: { tenantId: string; pageAccessToken: string } | null;
  inactive?: { tenantId: string } | null;
  graphLead?: {
    id: string;
    field_data: { name: string; values: string[] }[];
    form_id?: string;
    ad_id?: string;
  };
  graphForms?: { id: string; name?: string }[];
  graphFormLeads?: {
    id: string;
    field_data: { name: string; values: string[] }[];
    form_id?: string;
  }[];
  graphError?: Error;
  duplicateDelivery?: boolean;
  existingLink?: { leadId: string } | null;
  existingLeadgenIds?: string[];
}) {
  const createdLeads: unknown[] = [];
  const deletedKeys: string[] = [];
  const upserts: unknown[] = [];

  const prisma = {
    tenantMetaConnection: {
      findFirst: async (args: {
        where: { pageId: string; ativo?: boolean };
      }) => {
        if (args.where.ativo === true) {
          return opts.connection ?? null;
        }
        if (opts.connection) return { ...opts.connection, ativo: true };
        if (opts.inactive) return { ...opts.inactive, ativo: false };
        return null;
      },
      findMany: async () =>
        opts.connection
          ? [{ ...opts.connection, pageId: PAGE_ID }]
          : [],
    },
    metaWebhookDelivery: {
      create: async () => {
        if (opts.duplicateDelivery) throw p2002();
        return { id: 'delivery-1' };
      },
      delete: async (args: { where: { deliveryKey: string } }) => {
        deletedKeys.push(args.where.deliveryKey);
        return {};
      },
    },
    leadMetaLink: {
      findUnique: async (args: { where: { leadgenId: string } }) => {
        if (opts.existingLeadgenIds?.includes(args.where.leadgenId)) {
          return { leadId: 'already-there' };
        }
        return opts.existingLink ?? null;
      },
      upsert: async (args: unknown) => {
        upserts.push(args);
        return {};
      },
    },
    lead: {
      findFirst: async () => null,
      create: async (args: { data: Record<string, unknown> }) => {
        const row = { id: 'crm-lead-1', tags: [], ...args.data };
        createdLeads.push(row);
        return row;
      },
      update: async () => ({}),
    },
  };

  const graphApi = {
    fetchLead: async () => {
      if (opts.graphError) throw opts.graphError;
      return (
        opts.graphLead ?? {
          id: LEADGEN_ID,
          field_data: [
            { name: 'full_name', values: ['Ana Silva'] },
            { name: 'email', values: ['ana@example.com'] },
            { name: 'phone_number', values: ['11999998888'] },
          ],
        }
      );
    },
    listLeadgenForms: async () => opts.graphForms ?? [{ id: 'form-1' }],
    listFormLeads: async () => opts.graphFormLeads ?? [],
  };

  const service = new MetaService(
    prisma as never,
    { get: () => undefined } as never,
    graphApi as unknown as MetaGraphApiService,
  );

  return { service, createdLeads, deletedKeys, upserts };
}

describe('MetaService.handleWebhook', () => {
  it('page_id desconhecido: HTTP-equivalente 200, sem criar lead', async () => {
    const { service, createdLeads } = createService({ connection: null });
    const result = await service.handleWebhook(payload());
    assert.deepEqual(result, { ok: true, leadIds: [] });
    assert.equal(createdLeads.length, 0);
  });

  it('TenantMetaConnection inativa: não cria lead', async () => {
    const { service, createdLeads } = createService({
      connection: null,
      inactive: { tenantId: TENANT_ID },
    });
    const result = await service.handleWebhook(payload());
    assert.deepEqual(result, { ok: true, leadIds: [] });
    assert.equal(createdLeads.length, 0);
  });

  it('connection ativa + Graph OK: cria lead no tenant da connection', async () => {
    const { service, createdLeads, upserts } = createService({
      connection: { tenantId: TENANT_ID, pageAccessToken: 'page-token' },
    });
    const result = await service.handleWebhook(payload());
    assert.deepEqual(result, { ok: true, leadIds: ['crm-lead-1'] });
    const created = createdLeads[0] as { tenantId: string; nome: string };
    assert.equal(created.tenantId, TENANT_ID);
    assert.equal(created.nome, 'Ana Silva');
    assert.equal(upserts.length, 1);
  });

  it('não usa tenant default quando a connection aponta para outro tenant', async () => {
    const { service, createdLeads } = createService({
      connection: {
        tenantId: 'tenant-imobiliaria-x',
        pageAccessToken: 'page-token',
      },
    });
    await service.handleWebhook(payload());
    assert.equal(
      (createdLeads[0] as { tenantId: string }).tenantId,
      'tenant-imobiliaria-x',
    );
  });

  it('Graph API com erro: propaga e libera a chave de idempotência', async () => {
    const { service, deletedKeys } = createService({
      connection: { tenantId: TENANT_ID, pageAccessToken: 'page-token' },
      graphError: new Error('Meta Graph API: Invalid OAuth access token'),
    });
    await assert.rejects(
      () => service.handleWebhook(payload()),
      /Invalid OAuth access token/,
    );
    assert.deepEqual(deletedKeys, [`leadgen:${LEADGEN_ID}`]);
  });

  it('lead duplicado (P2002): não cria segundo lead', async () => {
    const { service, createdLeads } = createService({
      connection: { tenantId: TENANT_ID, pageAccessToken: 'page-token' },
      duplicateDelivery: true,
      existingLink: { leadId: 'already-there' },
    });
    const result = await service.handleWebhook(payload());
    assert.deepEqual(result, { ok: true, leadIds: ['already-there'] });
    assert.equal(createdLeads.length, 0);
  });

  it('payload inválido: ok sem leads', async () => {
    const { service } = createService({
      connection: { tenantId: TENANT_ID, pageAccessToken: 'page-token' },
    });
    const result = await service.handleWebhook({ object: 'page', entry: [] });
    assert.deepEqual(result, { ok: true, leadIds: [] });
  });

  it('ping dummy da ferramenta de teste: cria lead sem chamar Graph API', async () => {
    const { service, createdLeads } = createService({
      connection: { tenantId: TENANT_ID, pageAccessToken: 'page-token' },
      graphError: new Error('não deveria buscar lead dummy'),
    });
    const result = await service.handleWebhook(
      payload('444444444444', '444444444444'),
    );
    assert.deepEqual(result, { ok: true, leadIds: ['crm-lead-1'] });
    const created = createdLeads[0] as { nome: string; tenantId: string };
    assert.equal(created.nome, 'Lead de teste Meta');
    assert.equal(created.tenantId, TENANT_ID);
  });
});

describe('MetaService.syncActiveConnections', () => {
  it('importa lead real da Graph e ignora placeholder da ferramenta de teste', async () => {
    const { service, createdLeads } = createService({
      connection: { tenantId: TENANT_ID, pageAccessToken: 'page-token' },
      graphFormLeads: [
        {
          id: '1054456354112245',
          field_data: [
            {
              name: 'full_name',
              values: ['<test lead: dummy data for full_name>'],
            },
          ],
        },
        {
          id: '1563367468605320',
          field_data: [
            { name: 'full_name', values: ['Carmen Guimaraes'] },
            { name: 'phone_number', values: ['14996516819'] },
          ],
        },
      ],
    });
    const result = await service.syncActiveConnections();
    assert.equal(result.created, 1);
    assert.equal(result.skipped, 1);
    assert.equal(createdLeads.length, 1);
    assert.equal((createdLeads[0] as { nome: string }).nome, 'Carmen Guimaraes');
  });

  it('não reimporta leadgen já vinculado', async () => {
    const { service, createdLeads } = createService({
      connection: { tenantId: TENANT_ID, pageAccessToken: 'page-token' },
      existingLeadgenIds: ['1563367468605320'],
      graphFormLeads: [
        {
          id: '1563367468605320',
          field_data: [{ name: 'full_name', values: ['Carmen Guimaraes'] }],
        },
      ],
    });
    const result = await service.syncActiveConnections();
    assert.equal(result.created, 0);
    assert.equal(result.skipped, 1);
    assert.equal(createdLeads.length, 0);
  });
});
