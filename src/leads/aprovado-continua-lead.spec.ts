import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AnaliseStatus, ContatoTipo, Role } from '@prisma/client';
import { AnaliseService } from '../analise/analise.service';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { LeadsService } from './leads.service';

function user(): AuthenticatedUser {
  return {
    id: 'u1',
    email: 'a@t.com',
    role: Role.admin,
    name: 'Admin',
    tenantId: 't1',
  };
}

function trackedPrisma() {
  const calls: Array<{ model: string; args: unknown }> = [];
  const prisma = {
    lead: {
      updateMany: async (args: unknown) => {
        calls.push({ model: 'lead', args });
        return { count: 1 };
      },
      findFirst: async () => null,
    },
    documentacao: {
      updateMany: async (args: unknown) => {
        calls.push({ model: 'documentacao', args });
        return { count: 1 };
      },
    },
    analise: {
      updateMany: async (args: unknown) => {
        calls.push({ model: 'analise', args });
        return { count: 1 };
      },
    },
  };
  return { prisma, calls };
}

describe('ficha de documentação não mexe no funil', () => {
  it('análise aprovada devolve o cliente ao funil de leads sem alterar a ficha', async () => {
    const { prisma, calls } = trackedPrisma();
    const service = new AnaliseService(
      prisma as never,
      {} as never,
      {} as never,
      { getSlugsByPapel: async () => [] } as never,
      {} as never,
    );

    await (
      service as unknown as {
        leaveAnaliseAfterParecer: (
          tenantId: string,
          leadId: string,
          autorId: string,
          status: AnaliseStatus,
        ) => Promise<void>;
      }
    ).leaveAnaliseAfterParecer('t1', 'l1', 'u1', AnaliseStatus.aprovado);

    assert.equal(calls.filter((call) => call.model === 'lead').length, 1);
    assert.equal(
      calls.filter((call) => call.model === 'documentacao').length,
      0,
    );

    calls.length = 0;
    await (
      service as unknown as {
        leaveAnaliseAfterParecer: (
          tenantId: string,
          leadId: string,
          autorId: string,
          status: AnaliseStatus,
        ) => Promise<void>;
      }
    ).leaveAnaliseAfterParecer('t1', 'l1', 'u1', AnaliseStatus.reprovado);
    assert.equal(calls.length, 0);
  });

  it('a listagem mantém o cliente na carteira mesmo com ficha', async () => {
    const updates: Array<{ model: string }> = [];
    const leads = [
      {
        id: 'aprovado',
        tipo: ContatoTipo.cliente,
        stage: 'perfil',
        documentacoes: [],
      },
      {
        id: 'reprovado',
        tipo: ContatoTipo.cliente,
        stage: 'perfil',
        documentacoes: [],
      },
      {
        id: 'ja-lead',
        tipo: ContatoTipo.lead,
        stage: 'perfil',
        documentacoes: [],
      },
      {
        id: 'carteira',
        tipo: ContatoTipo.cliente,
        stage: 'perfil',
        documentacoes: [],
      },
    ];
    const prisma = {
      lead: {
        findMany: async () => leads,
        count: async () => leads.length,
        updateMany: async () => {
          updates.push({ model: 'lead' });
          return { count: 1 };
        },
      },
      documentacao: {
        findMany: async () => [
          { leadId: 'aprovado', status1: 'Aprovado', status2: '', vgv: null },
          { leadId: 'reprovado', status1: 'Reprovado', status2: '', vgv: null },
          { leadId: 'ja-lead', status1: 'Aprovado', status2: '', vgv: null },
        ],
        updateMany: async () => {
          updates.push({ model: 'documentacao' });
          return { count: 1 };
        },
      },
      $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
    };
    const service = new LeadsService(
      prisma as never,
      {} as never,
      { leadScope: async () => ({ tenantId: 't1' }) } as never,
      {} as never,
      {} as never,
      {
        loadFunilContext: async () => ({ etapasBySlug: new Map() }),
        monitoramentoWhere: () => null,
        decorateLeadsWithTarefas: async (data: unknown) => data,
      } as never,
      {} as never,
      {} as never,
    );

    const result = await service.findAll({ page: 1, limit: 20 }, user());
    const byId = new Map(result.data.map((lead) => [lead.id, lead.tipo]));

    assert.equal(byId.get('aprovado'), ContatoTipo.cliente);
    assert.equal(byId.get('reprovado'), ContatoTipo.cliente);
    assert.equal(byId.get('ja-lead'), ContatoTipo.lead);
    assert.equal(byId.get('carteira'), ContatoTipo.cliente);
    assert.equal(updates.length, 0);
  });
});
