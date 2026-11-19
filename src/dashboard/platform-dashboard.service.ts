import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  FinanceiroTituloStatus,
  FinanceiroTituloTipo,
  PlatformContratoStatus,
  PlatformContratoTipo,
  UserStatus,
} from '@prisma/client';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import {
  isPlatformAdmin,
  PLATFORM_TENANT_ID,
} from '../common/utils/tenant';
import { PrismaService } from '../prisma/prisma.service';

/** Assinatura que ainda representa receita recorrente contratada. */
const ASSINATURA_VIGENTE: PlatformContratoStatus[] = [
  PlatformContratoStatus.ativo,
  PlatformContratoStatus.atrasado,
];

const TITULO_EM_ABERTO: FinanceiroTituloStatus[] = [
  FinanceiroTituloStatus.aberto,
  FinanceiroTituloStatus.atrasado,
];

export type PlataformaDashboard = {
  periodo: { mes: number; ano: number; inicio: string; fim: string };
  criterios: {
    conversao: string;
    mrr: string;
    adesao: string;
    recebido: string;
    vencido: string;
    suspensoCancelado: string;
  };
  comercial: {
    total: number;
    novos: number;
    emAndamento: number;
    convertidos: number;
    /** Null quando não houve lead no período. */
    taxaConversao: number | null;
  };
  carteira: {
    total: number;
    ativos: number;
    inativos: number;
    porPlano: Array<{ plano: string; total: number }>;
    recemConvertidos: Array<{
      leadId: string;
      nome: string;
      tenantId: string;
      criadoEm: string;
    }>;
  };
  receita: {
    mrr: number;
    adesoesContratadas: number;
    recebido: number;
    aReceberAberto: number;
    vencido: number;
  };
  acompanhamento: {
    leadsSemMovimento: Array<{ id: string; nome: string; ultimaMovimentacao: string }>;
    assinaturasAtencao: Array<{
      id: string;
      titulo: string;
      status: string;
      tenantNome: string;
      valorMensalidade: number;
    }>;
  };
};

@Injectable()
export class PlatformDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async resumo(
    requester: AuthenticatedUser,
    mes?: number,
    ano?: number,
  ): Promise<PlataformaDashboard> {
    if (!isPlatformAdmin(requester)) {
      throw new ForbiddenException(
        'O dashboard da plataforma é exclusivo do super admin.',
      );
    }
    const periodo = periodoBrasil(mes, ano);
    const agora = new Date();
    const seteDias = new Date(agora.getTime() - 7 * 24 * 60 * 60 * 1000);
    const leadBase = { tenantId: PLATFORM_TENANT_ID };
    const clienteWhere = { id: { not: PLATFORM_TENANT_ID } };
    const tituloBase = {
      tenantId: PLATFORM_TENANT_ID,
      tipo: FinanceiroTituloTipo.receber,
      platformContratoId: { not: null },
    };
    const vigente = {
      tipo: PlatformContratoTipo.assinatura,
      status: { in: ASSINATURA_VIGENTE },
      tenantId: { not: PLATFORM_TENANT_ID },
    };

    const [
      totalLeads,
      novos,
      emAndamento,
      convertidosPeriodo,
      totalClientes,
      ativos,
      inativos,
      planos,
      recem,
      mrr,
      adesao,
      recebido,
      aberto,
      vencido,
      parados,
      atencao,
    ] = await Promise.all([
      this.prisma.lead.count({ where: leadBase }),
      this.prisma.lead.count({
        where: { ...leadBase, createdAt: { gte: periodo.inicio, lt: periodo.fim } },
      }),
      this.prisma.lead.count({
        where: { ...leadBase, perdidoAt: null, convertedTenantId: null },
      }),
      this.prisma.lead.count({
        where: {
          ...leadBase,
          convertedTenantId: { not: null },
          convertedAt: { gte: periodo.inicio, lt: periodo.fim },
        },
      }),
      this.prisma.tenant.count({ where: clienteWhere }),
      this.prisma.tenant.count({
        where: { ...clienteWhere, status: UserStatus.ativo },
      }),
      this.prisma.tenant.count({
        where: { ...clienteWhere, status: UserStatus.inativo },
      }),
      this.prisma.tenant.groupBy({
        by: ['plano'],
        where: clienteWhere,
        _count: { _all: true },
      }),
      this.prisma.lead.findMany({
        where: { ...leadBase, convertedTenantId: { not: null } },
        orderBy: { convertedAt: 'desc' },
        take: 8,
        select: {
          id: true,
          nome: true,
          convertedTenantId: true,
          convertedAt: true,
        },
      }),
      this.prisma.platformContrato.aggregate({
        where: vigente,
        _sum: { valorMensalidade: true },
      }),
      this.prisma.platformContrato.aggregate({
        where: vigente,
        _sum: { valorAdesao: true },
      }),
      this.prisma.financeiroTitulo.aggregate({
        where: {
          ...tituloBase,
          status: FinanceiroTituloStatus.pago,
          dataPagamento: { gte: periodo.inicio, lt: periodo.fim },
        },
        _sum: { valor: true },
      }),
      this.prisma.financeiroTitulo.aggregate({
        where: {
          ...tituloBase,
          status: { in: TITULO_EM_ABERTO },
          vencimento: { gte: inicioDoDiaBrasil(agora) },
        },
        _sum: { valor: true },
      }),
      this.prisma.financeiroTitulo.aggregate({
        where: {
          ...tituloBase,
          status: { in: TITULO_EM_ABERTO },
          vencimento: { lt: inicioDoDiaBrasil(agora) },
        },
        _sum: { valor: true },
      }),
      this.prisma.lead.findMany({
        where: {
          ...leadBase,
          perdidoAt: null,
          convertedTenantId: null,
          lastMovementAt: { lt: seteDias },
        },
        orderBy: { lastMovementAt: 'asc' },
        take: 8,
        select: { id: true, nome: true, lastMovementAt: true },
      }),
      this.prisma.platformContrato.findMany({
        where: {
          tipo: PlatformContratoTipo.assinatura,
          status: {
            in: [PlatformContratoStatus.atrasado, PlatformContratoStatus.suspenso],
          },
          tenantId: { not: PLATFORM_TENANT_ID },
        },
        orderBy: { updatedAt: 'desc' },
        take: 8,
        select: {
          id: true,
          titulo: true,
          status: true,
          valorMensalidade: true,
          tenant: { select: { name: true } },
        },
      }),
    ]);

    const baseConversao = novos;
    return {
      periodo: {
        mes: periodo.mes,
        ano: periodo.ano,
        inicio: periodo.inicio.toISOString(),
        fim: periodo.fim.toISOString(),
      },
      criterios: {
        conversao:
          'Leads do tenant da plataforma com convertedAt no mês, divididos pelos leads criados nesse mês. Null se não houve lead novo.',
        mrr:
          'Soma de valorMensalidade dos PlatformContrato tipo assinatura com status ativo ou atrasado. Proposta, suspenso, cancelado e encerrado ficam de fora. Não usa movimentação financeira.',
        adesao:
          'Soma de valorAdesao dos mesmos contratos vigentes. É valor contratado, não valor recebido.',
        recebido:
          'Soma dos FinanceiroTitulo a receber do livro da plataforma, com platformContratoId, status pago e dataPagamento no mês.',
        vencido:
          'Títulos a receber do livro da plataforma ligados a contrato, status aberto ou atrasado, com vencimento anterior ao dia de hoje em Brasília.',
        suspensoCancelado:
          'O cadastro da imobiliária só tem ativo e inativo. Suspenso e cancelado são status do PlatformContrato, não do tenant.',
      },
      comercial: {
        total: totalLeads,
        novos,
        emAndamento,
        convertidos: convertidosPeriodo,
        taxaConversao: baseConversao === 0 ? null : convertidosPeriodo / baseConversao,
      },
      carteira: {
        total: totalClientes,
        ativos,
        inativos,
        porPlano: planos.map((row) => ({
          plano: row.plano,
          total: row._count._all,
        })),
        recemConvertidos: recem.map((row) => ({
          leadId: row.id,
          nome: row.nome,
          tenantId: row.convertedTenantId ?? '',
          criadoEm: (row.convertedAt ?? new Date(0)).toISOString(),
        })),
      },
      receita: {
        mrr: mrr._sum.valorMensalidade ?? 0,
        adesoesContratadas: adesao._sum.valorAdesao ?? 0,
        recebido: recebido._sum.valor ?? 0,
        aReceberAberto: aberto._sum.valor ?? 0,
        vencido: vencido._sum.valor ?? 0,
      },
      acompanhamento: {
        leadsSemMovimento: parados.map((row) => ({
          id: row.id,
          nome: row.nome,
          ultimaMovimentacao: row.lastMovementAt.toISOString(),
        })),
        assinaturasAtencao: atencao.map((row) => ({
          id: row.id,
          titulo: row.titulo,
          status: row.status,
          tenantNome: row.tenant.name,
          valorMensalidade: row.valorMensalidade,
        })),
      },
    };
  }
}

function periodoBrasil(mes?: number, ano?: number) {
  const agora = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const anoRef = ano && ano >= 2000 ? ano : agora.getUTCFullYear();
  const mesRef = mes && mes >= 1 && mes <= 12 ? mes : agora.getUTCMonth() + 1;
  const inicio = new Date(Date.UTC(anoRef, mesRef - 1, 1, 3, 0, 0));
  const fim = new Date(Date.UTC(anoRef, mesRef, 1, 3, 0, 0));
  return { mes: mesRef, ano: anoRef, inicio, fim };
}

function inicioDoDiaBrasil(agora: Date) {
  const brasil = new Date(agora.getTime() - 3 * 60 * 60 * 1000);
  return new Date(
    Date.UTC(
      brasil.getUTCFullYear(),
      brasil.getUTCMonth(),
      brasil.getUTCDate(),
      3,
      0,
      0,
    ),
  );
}
