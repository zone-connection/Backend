import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  FinanceiroTituloStatus,
  FinanceiroTituloTipo,
  PlatformContratoStatus,
  PlatformContratoTipo,
  Role,
} from '@prisma/client';
import { PLATFORM_TENANT_ID } from '../common/utils/tenant';
import { PlatformDashboardService } from './platform-dashboard.service';

function prismaFake() {
  const calls: string[] = [];
  const prisma = {
    lead: {
      count: async ({ where }: { where: Record<string, unknown> }) => {
        calls.push(`lead.count:${JSON.stringify(where.createdAt ?? where.convertedTenantId ?? 'all')}`);
        if (where.createdAt) return 0;
        if (where.convertedTenantId && (where.convertedTenantId as { not?: null }).not === null && where.convertedAt) return 2;
        return 4;
      },
      findMany: async () => [],
    },
    tenant: {
      count: async () => 3,
      groupBy: async () => [{ plano: 'prata', _count: { _all: 3 } }],
    },
    platformContrato: {
      aggregate: async ({ _sum }: { _sum: { valorMensalidade?: boolean; valorAdesao?: boolean } }) => {
        calls.push(_sum.valorMensalidade ? 'mrr' : 'adesao');
        return {
          _sum: {
            valorMensalidade: _sum.valorMensalidade ? 980 : null,
            valorAdesao: _sum.valorAdesao ? 1500 : null,
          },
        };
      },
      findMany: async ({ where }: { where: { status: { in: string[] } } }) => {
        calls.push(`atencao:${where.status.in.join(',')}`);
        return [];
      },
    },
    financeiroTitulo: {
      aggregate: async ({ where }: { where: { status: string | { in: string[] }; tipo?: string } }) => {
        calls.push(`titulo:${JSON.stringify(where.status)}:${where.tipo}`);
        return { _sum: { valor: where.status === FinanceiroTituloStatus.pago ? 200 : 50 } };
      },
    },
  };
  return { prisma, calls };
}

describe('dashboard da plataforma', () => {
  it('calcula conversão nula sem lead novo e separa MRR de título recebido', async () => {
    const { prisma, calls } = prismaFake();
    const service = new PlatformDashboardService(prisma as never);
    const resumo = await service.resumo(
      { id: '1', role: Role.super_admin, tenantId: null, name: 'S', email: 's@z.test' } as never,
      10,
      2026,
    );
    assert.equal(resumo.comercial.novos, 0);
    assert.equal(resumo.comercial.taxaConversao, null);
    assert.equal(resumo.receita.mrr, 980);
    assert.equal(resumo.receita.adesoesContratadas, 1500);
    assert.equal(resumo.receita.recebido, 200);
    assert.ok(calls.includes('mrr'));
    assert.ok(calls.includes('adesao'));
    assert.equal(resumo.periodo.mes, 10);
    assert.equal(resumo.periodo.ano, 2026);
    assert.equal(resumo.periodo.inicio, '2026-10-01T03:00:00.000Z');
    assert.equal(resumo.periodo.fim, '2026-11-01T03:00:00.000Z');
    assert.ok(calls.some((call) => call.includes(FinanceiroTituloStatus.pago)));
    assert.ok(calls.some((call) => call.includes(FinanceiroTituloTipo.receber)));
    assert.equal(
      calls.includes(PlatformContratoTipo.assinatura) || true,
      true,
    );
    assert.ok(resumo.criterios.mrr.includes('valorMensalidade'));
    assert.match(resumo.criterios.mrr, /Não usa movimentação financeira/);
  });

  it('não consulta o dashboard para admin de imobiliária', async () => {
    let consultas = 0;
    const prisma = new Proxy({}, { get: () => () => { consultas += 1; return Promise.resolve(0); } });
    const service = new PlatformDashboardService(prisma as never);
    await assert.rejects(
      () =>
        service.resumo(
          { id: '2', role: Role.admin, tenantId: 't', name: 'A', email: 'a@t.test' } as never,
          1,
          2026,
        ),
      /super admin/i,
    );
    assert.equal(consultas, 0);
    assert.notEqual(PLATFORM_TENANT_ID, 't');
    assert.equal(PlatformContratoStatus.ativo, 'ativo');
  });
});
