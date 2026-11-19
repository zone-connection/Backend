import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  FinanceiroTituloStatus,
  FinanceiroTituloTipo,
  PlatformContratoStatus,
  PlatformContratoTipo,
  Role,
  TenantPlano,
} from '@prisma/client';
import { PLATFORM_TENANT_ID } from '../common/utils/tenant';
import { PlatformContratosService } from '../platform-contratos/platform-contratos.service';
import { LeadConversaoService } from './lead-conversao.service';
import type { ConverterLeadClienteDto } from './dto/converter-lead-cliente.dto';

const LEAD_ID = '11111111-1111-4111-8111-111111111111';
const TENANT_ID = '22222222-2222-4222-8222-222222222222';

const condicoes: ConverterLeadClienteDto = {
  plano: TenantPlano.prata,
  valorAdesao: 1000,
  valorMensalidade: 490,
  qtdMensalidades: 12,
  dataInicio: '2026-10-01',
  vencimento: '2026-10-10',
};

const superAdmin = {
  id: 'admin-1',
  role: Role.super_admin,
  tenantId: null,
  name: 'Super',
  email: 's@zone.test',
};

function leadBase() {
  return {
    id: LEAD_ID,
    tenantId: PLATFORM_TENANT_ID,
    nome: 'Imobiliária Aurora',
    email: 'contato@aurora.test',
    telefone: '81999999999',
    cpf: null as string | null,
    perdidoAt: null as Date | null,
    convertedTenantId: null as string | null,
    conversionSlug: null as string | null,
    conversionLock: null as string | null,
    conversionLockedAt: null as Date | null,
  };
}

function harness(options?: {
  tenantBySlug?: { id: string } | null;
  contratoId?: string | null;
  linkFailsOnce?: boolean;
  contratoFailsOnce?: boolean;
}) {
  const lead = leadBase();
  const tenantsCreated: string[] = [];
  const contratosCreated: Array<Record<string, unknown>> = [];
  let linkFailures = options?.linkFailsOnce ? 1 : 0;
  let contratoFailures = options?.contratoFailsOnce ? 1 : 0;
  let contratoId = options?.contratoId ?? null;
  const titulos = [
    {
      id: 'titulo-1',
      descricao: 'Assinatura — Mensalidade',
      parcela: 'Mensalidade 1/12',
      valor: 490,
      vencimento: new Date('2026-10-10T03:00:00.000Z'),
      status: FinanceiroTituloStatus.aberto,
      platformContratoId: 'contrato-1',
    },
  ];

  const prisma = {
    lead: {
      findFirst: async ({ where }: { where: { id: string; tenantId: string } }) =>
        where.id === lead.id && where.tenantId === PLATFORM_TENANT_ID
          ? { ...lead }
          : null,
      findUnique: async () => ({ ...lead }),
      updateMany: async ({
        where,
        data,
      }: {
        where: {
          id: string;
          convertedTenantId?: string | null;
          conversionLock?: string | null;
        };
        data: Partial<typeof lead>;
      }) => {
        if (where.id !== lead.id) return { count: 0 };
        if (
          where.convertedTenantId !== undefined &&
          where.convertedTenantId !== lead.convertedTenantId
        ) {
          return { count: 0 };
        }
        if (
          where.conversionLock !== undefined &&
          where.conversionLock !== lead.conversionLock
        ) {
          return { count: 0 };
        }
        if (
          linkFailures > 0 &&
          data.convertedTenantId &&
          where.conversionLock
        ) {
          linkFailures -= 1;
          throw new Error('falha ao vincular');
        }
        Object.assign(lead, data);
        return { count: 1 };
      },
    },
    tenant: {
      findUnique: async () =>
        options?.tenantBySlug ??
        (tenantsCreated.length > 0 ? { id: TENANT_ID } : null),
      count: async () => 1,
    },
    platformContrato: {
      findFirst: async () => (contratoId ? { id: contratoId, codigo: 'CONT-1' } : null),
    },
    financeiroTitulo: {
      findMany: async () => titulos,
    },
  };

  const tenants = {
    create: async (dto: { slug: string; name: string; plano: TenantPlano }) => {
      tenantsCreated.push(dto.slug);
      return {
        id: TENANT_ID,
        name: dto.name,
        plano: dto.plano,
        temporaryPassword: 'temp-senha',
      };
    },
  };

  const contratos = {
    createComTitulos: async (dto: Record<string, unknown>) => {
      if (contratoFailures > 0) {
        contratoFailures -= 1;
        throw new Error('falha ao gerar títulos');
      }
      contratosCreated.push(dto);
      contratoId = 'contrato-1';
      return {
        id: 'contrato-1',
        titulos: [
          {
            id: 'titulo-1',
            descricao: 'Assinatura — Mensalidade',
            parcela: 'Mensalidade 1/12',
            valor: 490,
            vencimento: '2026-10-10',
            status: 'aberto',
            platformContratoId: 'contrato-1',
          },
        ],
      };
    },
  };

  const service = new LeadConversaoService(
    prisma as never,
    tenants as never,
    contratos as never,
  );

  return { service, lead, tenantsCreated, contratosCreated, prisma };
}

describe('conversão de lead em cliente', () => {
  it('converte um lead elegível e pede a assinatura ao serviço existente', async () => {
    const { service, tenantsCreated, contratosCreated } = harness();
    const result = await service.converter(LEAD_ID, condicoes, superAdmin as never);
    assert.equal(tenantsCreated.length, 1);
    assert.equal(contratosCreated.length, 1);
    assert.equal(contratosCreated[0].tipo, PlatformContratoTipo.assinatura);
    assert.equal(contratosCreated[0].plano, TenantPlano.prata);
    assert.equal(contratosCreated[0].valorMensalidade, 490);
    assert.equal(result.tenantId, TENANT_ID);
    assert.equal(result.contratoId, 'contrato-1');
    assert.equal(result.titulos[0].status, 'aberto');
    assert.equal(result.temporaryPassword, 'temp-senha');
  });

  it('não duplica cliente nem assinatura ao repetir a conversão', async () => {
    const h = harness();
    await h.service.converter(LEAD_ID, condicoes, superAdmin as never);
    const again = await h.service.converter(LEAD_ID, condicoes, superAdmin as never);
    assert.equal(h.tenantsCreated.length, 1);
    assert.equal(h.contratosCreated.length, 1);
    assert.equal(again.alreadyConverted, true);
    assert.equal(again.contratoId, 'contrato-1');
    assert.equal(again.temporaryPassword, undefined);
  });

  it('duas requisições simultâneas criam um único cliente e uma única assinatura', async () => {
    const h = harness();
    const [a, b] = await Promise.all([
      h.service.converter(LEAD_ID, condicoes, superAdmin as never),
      h.service.converter(LEAD_ID, condicoes, superAdmin as never),
    ]);
    assert.equal(h.tenantsCreated.length, 1);
    assert.equal(h.contratosCreated.length, 1);
    assert.equal(a.tenantId, b.tenantId);
    assert.equal(a.contratoId, b.contratoId);
  });

  it('recusa a conversão sem as condições comerciais confirmadas', async () => {
    const { service, tenantsCreated } = harness();
    await assert.rejects(
      () =>
        service.converter(
          LEAD_ID,
          { ...condicoes, valorMensalidade: 0 },
          superAdmin as never,
        ),
      /mensalidade/i,
    );
    assert.equal(tenantsCreated.length, 0);
  });

  it('retoma uma conversão cujo cliente já existe e ainda não tem assinatura', async () => {
    const h = harness({ linkFailsOnce: true });
    await assert.rejects(
      () => h.service.converter(LEAD_ID, condicoes, superAdmin as never),
      (error: { getResponse?: () => { temporaryPassword?: string } }) => {
        assert.equal(error.getResponse?.().temporaryPassword, 'temp-senha');
        return true;
      },
    );
    assert.equal(h.tenantsCreated.length, 1);
    assert.equal(h.lead.convertedTenantId, null);
    assert.equal(h.lead.conversionLock, null);

    const recovered = await h.service.converter(LEAD_ID, condicoes, superAdmin as never);
    assert.equal(h.tenantsCreated.length, 1);
    assert.equal(h.contratosCreated.length, 1);
    assert.equal(recovered.tenantId, TENANT_ID);
    assert.equal(h.lead.convertedTenantId, TENANT_ID);
  });

  it('devolve a senha temporária se o cliente nasce e a assinatura falha, e a retomada não cria outro cliente', async () => {
    const h = harness({ contratoFailsOnce: true });

    await assert.rejects(
      () => h.service.converter(LEAD_ID, condicoes, superAdmin as never),
      (error: { getResponse?: () => { temporaryPassword?: string; tenantId?: string } }) => {
        const body = error.getResponse?.();
        assert.equal(body?.temporaryPassword, 'temp-senha');
        assert.equal(body?.tenantId, TENANT_ID);
        return true;
      },
    );
    assert.equal(h.tenantsCreated.length, 1);
    assert.equal(h.lead.convertedTenantId, TENANT_ID);
    assert.equal(h.lead.conversionLock, null);

    const recovered = await h.service.converter(LEAD_ID, condicoes, superAdmin as never);
    assert.equal(h.tenantsCreated.length, 1);
    assert.equal(h.contratosCreated.length, 1);
    assert.equal(recovered.contratoId, 'contrato-1');
    assert.equal(recovered.titulos[0].status, 'aberto');
    assert.equal(recovered.temporaryPassword, undefined);
  });

  it('retoma uma trava abandonada sem criar um segundo cliente', async () => {
    const h = harness({ tenantBySlug: { id: TENANT_ID } });
    h.lead.conversionLock = 'trava-morta';
    h.lead.conversionLockedAt = new Date(Date.now() - 120_000);
    h.lead.conversionSlug = 'imobiliaria-aurora-11111111';

    const result = await h.service.converter(LEAD_ID, condicoes, superAdmin as never);
    assert.equal(h.tenantsCreated.length, 0);
    assert.equal(result.tenantId, TENANT_ID);
    assert.equal(h.contratosCreated.length, 1);
    assert.equal(h.lead.conversionLock, null);
  });

  it('não deixa o admin de uma imobiliária converter o lead da plataforma', async () => {
    const { service, tenantsCreated } = harness();
    await assert.rejects(
      () =>
        service.converter(LEAD_ID, condicoes, {
          ...superAdmin,
          role: Role.admin,
          tenantId: '99999999-9999-4999-8999-999999999999',
        } as never),
      /super admin/i,
    );
    assert.equal(tenantsCreated.length, 0);
  });
});

describe('assinatura da plataforma gera títulos em aberto', () => {
  it('createComTitulos grava títulos a receber com status aberto', async () => {
    const gravados: Array<{ status: string; tipo: string; tenantId: string }> = [];
    const prisma = {
      tenant: { count: async () => 1 },
      platformContrato: {
        findFirst: async () => null,
        create: async ({ data }: { data: { parcelas: { create: unknown[] } } }) => ({
          id: 'contrato-1',
          createdAt: new Date('2026-10-01T00:00:00.000Z'),
          updatedAt: new Date('2026-10-01T00:00:00.000Z'),
          ...data,
          tenant: { id: TENANT_ID, name: 'Aurora', slug: 'aurora', plano: 'prata' },
          parcelas: (data.parcelas?.create ?? []).map((p, i) => ({
            id: `p${i}`,
            status: FinanceiroTituloStatus.aberto,
            dataPagamento: null,
            formaPagamento: '',
            ...(p as object),
          })),
        }),
      },
      financeiroParceiro: { findFirst: async () => null },
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          platformContrato: {
            create: async ({ data }: { data: { parcelas: { create: unknown[] } } }) => ({
              id: 'contrato-1',
              ...data,
              createdAt: new Date('2026-10-01T00:00:00.000Z'),
              updatedAt: new Date('2026-10-01T00:00:00.000Z'),
              tenant: { id: TENANT_ID, name: 'Aurora', slug: 'aurora', plano: 'prata' },
              parcelas: data.parcelas.create.map((p, i) => ({
                id: `p${i}`,
                status: FinanceiroTituloStatus.aberto,
                dataPagamento: null,
                formaPagamento: '',
                ...(p as object),
              })),
            }),
          },
          financeiroTitulo: {
            createMany: async ({ data }: { data: Array<{ status: string; tipo: string; tenantId: string }> }) => {
              gravados.push(...data);
              return { count: data.length };
            },
            findMany: async () =>
              gravados.map((t, i) => ({
                id: `t${i}`,
                descricao: 'x',
                parcela: '1',
                valor: 10,
                vencimento: new Date('2026-10-10T03:00:00.000Z'),
                ...t,
                platformContratoId: 'contrato-1',
              })),
          },
        }),
    };
    const service = new PlatformContratosService(prisma as never);
    const result = await service.createComTitulos(
      {
        tenantId: TENANT_ID,
        titulo: 'Assinatura Aurora',
        tipo: PlatformContratoTipo.assinatura,
        plano: TenantPlano.prata,
        valorAdesao: 1000,
        valorMensalidade: 490,
        qtdMensalidades: 2,
        dataInicio: '2026-10-01',
        vencimento: '2026-10-10',
      },
      superAdmin as never,
    );
    assert.ok(gravados.length >= 2);
    assert.ok(gravados.every((t) => t.status === FinanceiroTituloStatus.aberto));
    assert.ok(gravados.every((t) => t.tipo === FinanceiroTituloTipo.receber));
    assert.ok(gravados.every((t) => t.tenantId === PLATFORM_TENANT_ID));
    assert.ok(result.titulos.every((t) => t.status === FinanceiroTituloStatus.aberto));
  });

  it('um admin de imobiliária não cria contrato da plataforma', async () => {
    const service = new PlatformContratosService({} as never);
    await assert.rejects(
      () =>
        service.createComTitulos(
          {
            tenantId: TENANT_ID,
            titulo: 'Assinatura',
            tipo: PlatformContratoTipo.assinatura,
            plano: TenantPlano.bronze,
            valorAdesao: 10,
            valorMensalidade: 10,
            qtdMensalidades: 1,
            dataInicio: '2026-10-01',
            vencimento: '2026-10-10',
          },
          { ...superAdmin, role: Role.admin, tenantId: TENANT_ID } as never,
        ),
      (error: unknown) => {
        assert.match(String(error), /super admin|Super admin|Forbidden/i);
        return true;
      },
    );
  });
});
