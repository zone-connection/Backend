import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AgendamentoAlvo,
  AgendamentoEscopo,
  AgendamentoStatus,
  AgendamentoTipo,
  AnaliseStatus,
  ContatoTipo,
  FinanceiroComissaoStatus,
  FunilEtapaPapel,
  MetaEscopo,
  MetaPeriodo,
  MetaTipo,
  Prisma,
  Role,
  UserStatus,
  VendaUsadoFechamentoStatus,
  VendaUsadoVisitaStatus,
} from '@prisma/client';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { isCorretorLike } from '../common/utils/roles';
import {
  countStatusAndamento,
  countStatusVendido,
  documentacaoPipelineStatusKey,
  isStatusAnalise,
  isStatusAprovado,
  isStatusReprovado,
  documentacaoLeadEscopoWhere,
  documentacaoOperacionalWhere,
  documentacaoVendaNoPeriodoWhere,
  documentacaoVinculadaAoCorretorWhere,
  isStatusVendido,
  status2VendidoWhere,
  sumVgvVendido,
} from '../common/utils/documentacao-status';
import { requireTenantId } from '../common/utils/tenant';
import {
  hasAnyUserModule,
  sanitizeUserPermissions,
} from '../common/utils/user-permissions';
import { AgendaService } from '../agenda/agenda.service';
import { TeamScopeService } from '../equipes/team-scope.service';
import { FunisService } from '../funis/funis.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  janelaPeriodoBrasil,
  type PeriodoGranularidade,
} from '../common/utils/periodo-brasil';
import type {
  RankingCategoria,
  RankingFaixa,
} from './dto/query-dashboard.dto';

const BRASIL_UTC_OFFSET_MS = 3 * 60 * 60 * 1000;
const DIAS_PARADO_DEFAULT = 3;

type Periodo = { inicio: Date; fim: Date };

function evolucaoPct(atual: number, anterior: number): number {
  // Sem base no mês anterior: 0 se também não houver valor atual; senão +100%.
  if (anterior === 0) return atual === 0 ? 0 : 100;
  return Number((((atual - anterior) / anterior) * 100).toFixed(1));
}

function metric(atual: number, anterior: number) {
  return {
    valor: atual || 0,
    valorMesAnterior: anterior || 0,
    evolucaoPct: evolucaoPct(atual || 0, anterior || 0),
  };
}

function moneyNumber(value: Prisma.Decimal | number | null | undefined) {
  return Number(value ?? 0);
}

type ComissaoResumo = {
  total: number;
  aReceber: number;
  pendente: number;
  liberada: number;
  paga: number;
  vendas: number;
  vgv: number;
};

function emptyComissaoResumo(): ComissaoResumo {
  return {
    total: 0,
    aReceber: 0,
    pendente: 0,
    liberada: 0,
    paga: 0,
    vendas: 0,
    vgv: 0,
  };
}


type JanelasOpts = {
  /** Mês 1–12. Omite = mês corrente (BR). Alinha ao início do recorte. */
  mes?: number;
  /** Ano calendário. Omite = ano corrente (BR). */
  ano?: number;
  granularidade?: PeriodoGranularidade;
  faixa?: RankingFaixa;
  de?: string;
  ate?: string;
  now?: Date;
};

function diaBrasilParaInstant(isoDay: string, fimExclusivo = false) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDay.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]) + (fimExclusivo ? 1 : 0);
  return new Date(Date.UTC(year, month, day) + BRASIL_UTC_OFFSET_MS);
}

function granularidadeDaFaixa(
  faixa?: RankingFaixa,
  fallback?: PeriodoGranularidade,
): PeriodoGranularidade | undefined {
  if (faixa === 'mes') return 'mes';
  if (faixa === 'trimestre') return 'trimestre';
  if (faixa === 'ano') return 'anual';
  return fallback;
}

function janelasBrasil(opts: JanelasOpts = {}) {
  const now = opts.now ?? new Date();
  const brasil = new Date(now.getTime() - BRASIL_UTC_OFFSET_MS);
  const realY = brasil.getUTCFullYear();
  const realM = brasil.getUTCMonth();
  const d = brasil.getUTCDate();
  const dow = brasil.getUTCDay();
  const mondayOffset = (dow + 6) % 7;

  const janela = janelaPeriodoBrasil({
    mes: opts.mes,
    ano: opts.ano,
    granularidade: granularidadeDaFaixa(opts.faixa, opts.granularidade),
    now,
  });
  const y = janela.ano;
  const m = janela.mesInicio - 1;

  const toInstant = (yy: number, mm: number, dd: number) =>
    new Date(Date.UTC(yy, mm, dd) + BRASIL_UTC_OFFSET_MS);

  const inicioHoje = toInstant(realY, realM, d);
  const inicioAmanha = toInstant(realY, realM, d + 1);
  const inicioSemana = toInstant(realY, realM, d - mondayOffset);
  const fimSemana = toInstant(realY, realM, d - mondayOffset + 7);

  let mesAtual = janela.atual satisfies Periodo;
  let mesAnterior = janela.anterior satisfies Periodo;
  if (opts.faixa === 'hoje') {
    mesAtual = { inicio: inicioHoje, fim: inicioAmanha };
    mesAnterior = { inicio: toInstant(realY, realM, d - 1), fim: inicioHoje };
  } else if (opts.faixa === 'semana') {
    mesAtual = { inicio: inicioSemana, fim: fimSemana };
    mesAnterior = {
      inicio: toInstant(realY, realM, d - mondayOffset - 7),
      fim: inicioSemana,
    };
  } else if (opts.faixa === 'personalizado') {
    const inicio = diaBrasilParaInstant(opts.de ?? '') ?? inicioHoje;
    const fimBruto = diaBrasilParaInstant(opts.ate ?? '', true) ?? inicioAmanha;
    const fim = fimBruto.getTime() > inicio.getTime()
      ? fimBruto
      : new Date(inicio.getTime() + 24 * 60 * 60 * 1000);
    const duracao = fim.getTime() - inicio.getTime();
    mesAtual = { inicio, fim };
    mesAnterior = {
      inicio: new Date(inicio.getTime() - duracao),
      fim: inicio,
    };
  }

  return {
    agora: now,
    inicioHoje,
    inicioAmanha,
    inicioSemana,
    ano: y,
    mes: m,
    mesAtual,
    mesAnterior,
  };
}

const RANKING_CATEGORIA_META: Record<
  Exclude<RankingCategoria, 'lancamentos'>,
  { indicador: string; regra: string }
> = {
  documentacoes: {
    indicador: 'Documentações',
    regra:
      'Conta cada ficha operacional de documentação criada no período, uma vez, no corretor da ficha (ou do lead, se a ficha não tiver corretor). Exclusão ou troca de responsável altera o ranking.',
  },
  captacoes: {
    indicador: 'Captações',
    regra:
      'Conta cada captação registrada no período, uma vez, no responsável da captação. Remover a captação tira o ponto.',
  },
  visitas: {
    indicador: 'Visitas',
    regra:
      'Conta visita de agenda concluída no período (corretor atribuído, ou autor) e visita de usados marcada como realizada. Cada registro entra uma vez.',
  },
  vendas_usados: {
    indicador: 'Vendas de usados',
    regra:
      'Conta fechamento de usado concluído no período, uma vez por imóvel, no responsável do fechamento. Cancelar ou excluir tira o ponto.',
  },
  locacoes: {
    indicador: 'Locações',
    regra:
      'O módulo de locação ainda não registra contratos concluídos. O ranking permanece zerado até existir esse cadastro.',
  },
};

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agendaService: AgendaService,
    private readonly teamScope: TeamScopeService,
    private readonly funis: FunisService,
  ) {}

  async resumoCorretor(requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);
    const now = new Date();
    const inicioMes = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const inicioProximoMes = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
    );
    const recifeAgora = new Date(now.getTime() - BRASIL_UTC_OFFSET_MS);
    const inicioHoje = new Date(
      Date.UTC(
        recifeAgora.getUTCFullYear(),
        recifeAgora.getUTCMonth(),
        recifeAgora.getUTCDate(),
        3,
      ),
    );
    const inicioAmanha = new Date(inicioHoje.getTime() + 24 * 60 * 60 * 1000);
    const funilComercial = await this.funis.ensureTenantHasFunil(tenantId);
    const leadWhere = { tenantId, corretorId: requester.id, perdidoAt: null };
    const docWhereCorretor = {
      tenantId,
      ...documentacaoVinculadaAoCorretorWhere(requester.id),
    };

    const periodoMes = { inicio: inicioMes, fim: inicioProximoMes };
    const [
      carteira,
      novosContatos,
      funil,
      analises,
      documentacoes,
      agendaHoje,
      comissao,
    ] = await Promise.all([
      this.prisma.lead.groupBy({
        by: ['tipo'],
        where: leadWhere,
        _count: { _all: true },
      }),
      this.prisma.lead.count({
        where: {
          ...leadWhere,
          createdAt: { gte: inicioMes, lt: inicioProximoMes },
        },
      }),
      this.prisma.lead.groupBy({
        by: ['stage'],
        where: {
          ...leadWhere,
          tipo: ContatoTipo.lead,
          funilId: funilComercial.id,
        },
        _count: { _all: true },
      }),
      this.prisma.analise.groupBy({
        by: ['status'],
        where: { tenantId, lead: leadWhere },
        _count: { _all: true },
      }),
      this.prisma.documentacao.groupBy({
        by: ['status2'],
        where: docWhereCorretor,
        _count: { _all: true },
      }),
      this.agendaService.list(
        {
          from: inicioHoje.toISOString(),
          to: new Date(inicioAmanha.getTime() - 1).toISOString(),
        },
        requester,
      ),
      this.aggregateComissaoMes(tenantId, periodoMes, {
        papel: 'corretor',
        userId: requester.id,
      }),
    ]);

    const totalPorTipo = new Map(
      carteira.map((item) => [item.tipo, item._count._all]),
    );
    const totalLeads = totalPorTipo.get(ContatoTipo.lead) ?? 0;
    const totalClientes = totalPorTipo.get(ContatoTipo.cliente) ?? 0;
    const totalCarteira = totalLeads + totalClientes;
    const analiseSlug = await this.funis.getSlugByPapel(
      tenantId,
      FunilEtapaPapel.analise,
    );
    const emAnalise = analiseSlug
      ? (funil.find((item) => item.stage === analiseSlug)?._count._all ?? 0)
      : 0;
    const agendaAtiva = agendaHoje.filter(
      (item) => item.status !== 'cancelado',
    );

    return {
      periodo: {
        inicio: inicioMes.toISOString(),
        fim: inicioProximoMes.toISOString(),
      },
      carteira: {
        leads: totalLeads,
        clientes: totalClientes,
        novosContatos,
      },
      funil: funil.map((item) => ({
        etapa: item.stage,
        total: item._count._all,
      })),
      conversaoEmAnalise: totalCarteira
        ? Number(((emAnalise / totalCarteira) * 100).toFixed(1))
        : 0,
      analises: Object.values(AnaliseStatus).map((status) => ({
        status,
        total:
          analises.find((item) => item.status === status)?._count._all ?? 0,
      })),
      documentacao: {
        registrados: documentacoes.reduce(
          (total, item) => total + item._count._all,
          0,
        ),
        vendidos: countStatusVendido(documentacoes),
        emAndamento: countStatusAndamento(documentacoes),
        vgvVendidoMes: 0,
      },
      comissao,
      agenda: {
        totalHoje: agendaAtiva.length,
        pendentesHoje: agendaAtiva.filter(
          (item) => item.status === 'agendado',
        ).length,
        concluidosHoje: agendaAtiva.filter(
          (item) => item.status === 'concluido',
        ).length,
        itens: agendaAtiva.map((item) => ({
          id: item.id,
          titulo: item.titulo,
          tipo: item.tipo,
          status: item.status,
          startsAt: item.startsAt,
          contato: item.lead?.nome ?? null,
          categoria:
            item.escopo === AgendamentoEscopo.com_gerente ||
            item.alvoTipo !== AgendamentoAlvo.nenhum
              ? 'compartilhada'
              : 'pessoal',
        })),
      },
    };
  }

  async resumoAdmin(
    requester: AuthenticatedUser,
    filtros: {
      mes?: number;
      ano?: number;
      origem?: string;
      granularidade?: PeriodoGranularidade;
    } = {},
  ) {
    await this.assertDashboardGerencial(requester, [
      'dashboard',
      'taxaConversao',
    ]);

    const tenantId = requireTenantId(requester);
    const windows = janelasBrasil({
      mes: filtros.mes,
      ano: filtros.ano,
      granularidade: filtros.granularidade,
    });
    const { mesAtual, mesAnterior, inicioHoje, inicioAmanha, inicioSemana } =
      windows;
    const origem = filtros.origem?.trim() || undefined;
    const origemWhere = origem ? { origem } : {};
    const diasParado = DIAS_PARADO_DEFAULT;
    const paradoAntes = new Date(
      windows.agora.getTime() - diasParado * 24 * 60 * 60 * 1000,
    );

    const corretorIds = await this.teamScope.getVisibleCorretorIds(requester);
    const leadScope = await this.teamScope.leadScope(requester);
    const comissaoPapel = isCorretorLike(requester.role)
      ? 'corretor'
      : requester.role === Role.gerente
        ? 'gerente'
        : 'admin';
    const funilComercial = await this.funis.ensureTenantHasFunil(tenantId);
    const leadAtivoWhere: Prisma.LeadWhereInput = {
      ...leadScope,
      perdidoAt: null,
      ...origemWhere,
    };
    const leadCriadoWhere = (periodo: Periodo): Prisma.LeadWhereInput => ({
      ...leadScope,
      tipo: ContatoTipo.lead,
      perdidoAt: null,
      createdAt: { gte: periodo.inicio, lt: periodo.fim },
      ...origemWhere,
    });
    const vendaSlug = await this.funis.getSlugByPapel(
      tenantId,
      FunilEtapaPapel.venda,
    );
    /** Leads que entraram no período e já viraram venda (coorte). */
    const leadVendidoDaEntradaWhere = (periodo: Periodo) => ({
      ...leadCriadoWhere(periodo),
      OR: [
        ...(vendaSlug ? [{ stage: vendaSlug }] : []),
        {
          documentacoes: {
            some: status2VendidoWhere(),
          },
        },
      ],
    });
    const docEscopoWhere = {
      tenantId,
      ...documentacaoOperacionalWhere(),
      ...(corretorIds
        ? documentacaoVinculadaAoCorretorWhere(corretorIds)
        : {}),
      ...documentacaoLeadEscopoWhere(leadScope, origem),
    };
    /** Vendas/VGV: vendido/Bacen no período, ou ficha com VGV preenchido. */
    const docVendaWhere = (periodo: Periodo) => ({
      ...docEscopoWhere,
      AND: [
        documentacaoVendaNoPeriodoWhere(periodo),
        {
          OR: [status2VendidoWhere(), { vgv: { gt: 0 } }],
        },
      ],
    });
    /** Pipeline ao vivo: mesmas fichas da tela Documentação (sem recorte de cadastro). */
    const docPipelineStockWhere = () => docEscopoWhere;
    /** Fichas abertas no período — denominador da taxa de conversão. */
    const docCriadasWhere = (periodo: Periodo) => ({
      ...docEscopoWhere,
      createdAt: { gte: periodo.inicio, lt: periodo.fim },
    });
    const perdidoWhere = (periodo: Periodo): Prisma.LeadWhereInput => ({
      ...leadScope,
      perdidoAt: { gte: periodo.inicio, lt: periodo.fim },
      ...origemWhere,
    });

    const [
      funil,
      entradasHoje,
      entradasSemana,
      entradasMes,
      entradasMesAnt,
      semDono,
      parados,
      perdidosMes,
      perdidosMesAnt,
      perdidosMotivos,
      perdidosMotivosAnt,
      vendasDaEntradaMes,
      vendasDaEntradaMesAnt,
      vgvMes,
      vgvMesAnt,
      documentacaoStatusMes,
      documentacaoStatusMesAnt,
      documentacaoPipelineStock,
      agendaHoje,
      agendaAtrasados,
      corretores,
      equipes,
      metasAtivas,
      comissaoMes,
      comissaoMesAnt,
    ] = await Promise.all([
      this.prisma.lead.groupBy({
        by: ['stage'],
        where: {
          ...leadAtivoWhere,
          tipo: ContatoTipo.lead,
          funilId: funilComercial.id,
        },
        _count: { _all: true },
      }),
      this.prisma.lead.count({
        where: leadCriadoWhere({ inicio: inicioHoje, fim: inicioAmanha }),
      }),
      this.prisma.lead.count({
        where: leadCriadoWhere({ inicio: inicioSemana, fim: inicioAmanha }),
      }),
      this.prisma.lead.count({ where: leadCriadoWhere(mesAtual) }),
      this.prisma.lead.count({ where: leadCriadoWhere(mesAnterior) }),
      // Pool ainda não distribuído (mesmo critério de /leads "Chegaram"
      // e do dialog Distribuir): sem equipe e sem corretor.
      this.prisma.lead.count({
        where: {
          ...leadScope,
          tipo: ContatoTipo.lead,
          perdidoAt: null,
          corretorId: null,
          ...(requester.role === Role.gerente ? {} : { equipeId: null }),
          ...origemWhere,
        },
      }),
      this.prisma.lead.count({
        where: {
          ...leadAtivoWhere,
          updatedAt: { lt: paradoAntes },
        },
      }),
      this.prisma.lead.count({
        where: perdidoWhere(mesAtual),
      }),
      this.prisma.lead.count({
        where: perdidoWhere(mesAnterior),
      }),
      this.prisma.lead.groupBy({
        by: ['motivoPerda'],
        where: {
          ...perdidoWhere(mesAtual),
          motivoPerda: { not: null },
        },
        _count: { _all: true },
        orderBy: { _count: { motivoPerda: 'desc' } },
        take: 5,
      }),
      this.prisma.lead.groupBy({
        by: ['motivoPerda'],
        where: {
          ...perdidoWhere(mesAnterior),
          motivoPerda: { not: null },
        },
        _count: { _all: true },
      }),
      this.prisma.lead.count({
        where: leadVendidoDaEntradaWhere(mesAtual),
      }),
      this.prisma.lead.count({
        where: leadVendidoDaEntradaWhere(mesAnterior),
      }),
      this.prisma.documentacao.groupBy({
        by: ['status2'],
        where: docVendaWhere(mesAtual),
        _count: { _all: true },
        _sum: { vgv: true },
      }),
      this.prisma.documentacao.groupBy({
        by: ['status2'],
        where: docVendaWhere(mesAnterior),
        _count: { _all: true },
        _sum: { vgv: true },
      }),
      this.prisma.documentacao.groupBy({
        by: ['status1'],
        where: docCriadasWhere(mesAtual),
        _count: { _all: true },
      }),
      this.prisma.documentacao.groupBy({
        by: ['status1'],
        where: docCriadasWhere(mesAnterior),
        _count: { _all: true },
      }),
      this.prisma.documentacao.groupBy({
        by: ['status1'],
        where: docPipelineStockWhere(),
        _count: { _all: true },
      }),
      this.prisma.agendamento.findMany({
        where: {
          tenantId,
          startsAt: { gte: inicioHoje, lt: inicioAmanha },
          status: { not: AgendamentoStatus.cancelado },
          ...(corretorIds ? { autorId: { in: corretorIds } } : {}),
          ...(origem ? { lead: { origem } } : {}),
        },
        select: {
          id: true,
          titulo: true,
          tipo: true,
          status: true,
          startsAt: true,
          lead: { select: { nome: true } },
        },
        orderBy: { startsAt: 'asc' },
        take: 20,
      }),
      this.prisma.agendamento.count({
        where: {
          tenantId,
          status: AgendamentoStatus.agendado,
          startsAt: { lt: windows.agora },
          ...(corretorIds ? { autorId: { in: corretorIds } } : {}),
          ...(origem ? { lead: { origem } } : {}),
        },
      }),
      this.prisma.user.findMany({
        where: {
          tenantId,
          role: { in: [Role.corretor, Role.treinee] },
          status: UserStatus.ativo,
          ...(corretorIds ? { id: { in: corretorIds } } : {}),
        },
        select: {
          id: true,
          name: true,
          equipeId: true,
          equipe: { select: { id: true, name: true } },
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.equipe.findMany({
        where: {
          tenantId,
          status: UserStatus.ativo,
          ...(corretorIds
            ? { membros: { some: { id: { in: corretorIds } } } }
            : {}),
        },
        select: {
          id: true,
          name: true,
          membros: {
            where: {
              role: { in: [Role.corretor, Role.treinee] },
              status: UserStatus.ativo,
            },
            select: { id: true },
          },
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.meta.findMany({
        where: {
          tenantId,
          escopo: { in: [MetaEscopo.corretor, MetaEscopo.imobiliaria] },
          inicio: { lte: windows.agora },
          fim: { gt: windows.agora },
          periodo: MetaPeriodo.mensal,
          ...(corretorIds
            ? {
                OR: [
                  { escopo: MetaEscopo.imobiliaria },
                  { corretorId: { in: corretorIds } },
                ],
              }
            : {}),
        },
        include: {
          corretor: {
            select: {
              id: true,
              name: true,
              equipeId: true,
              equipe: { select: { id: true, name: true } },
            },
          },
        },
      }),
      this.aggregateComissaoMes(tenantId, mesAtual, {
        papel: comissaoPapel,
        userId: requester.id,
        corretorIds,
      }),
      this.aggregateComissaoMes(tenantId, mesAnterior, {
        papel: comissaoPapel,
        userId: requester.id,
        corretorIds,
      }),
    ]);

    const motivosAntMap = new Map(
      perdidosMotivosAnt.map((item) => [
        item.motivoPerda ?? 'Sem motivo',
        item._count._all,
      ]),
    );
    const pipelineCounts = (
      rows: Array<{ status1: string; _count: { _all: number } }>,
    ) =>
      rows.reduce(
        (acc, row) => {
          const key = documentacaoPipelineStatusKey(row.status1);
          if (key) acc[key] += row._count._all;
          return acc;
        },
        { aprovadas: 0, reprovadas: 0, emAnalise: 0 },
      );
    const pipelineAtual = pipelineCounts(documentacaoPipelineStock);
    const pipelineAnterior = pipelineCounts(documentacaoStatusMesAnt);

    const ranking = await this.buildRanking(
      tenantId,
      corretores,
      mesAtual,
      mesAnterior,
      origem,
    );
    const distribuicaoEquipes = await this.buildDistribuicaoEquipes(
      tenantId,
      equipes,
      corretores.map((c) => c.id),
      origem,
    );
    const metas = await this.buildMetasProgress(tenantId, metasAtivas);

    const taxaConversao = (vendas: number, documentacoes: number) =>
      documentacoes === 0
        ? 0
        : Number(((vendas / documentacoes) * 100).toFixed(1));

      const docsMes = documentacaoStatusMes.reduce(
        (total, row) => total + row._count._all,
        0,
      );
      const docsMesAnt = documentacaoStatusMesAnt.reduce(
        (total, row) => total + row._count._all,
        0,
      );
      const aprovacoesMes = pipelineCounts(documentacaoStatusMes).aprovadas;
      const aprovacoesMesAnt = pipelineCounts(documentacaoStatusMesAnt).aprovadas;
    const vendasDocsMes = countStatusVendido(vgvMes);
    const vendasDocsMesAnt = countStatusVendido(vgvMesAnt);
    const [cadastroMes, cadastroMesAnt] = await Promise.all([
      this.prisma.cadastroVenda.aggregate({
        where: {
          tenantId,
          dataVenda: { gte: mesAtual.inicio, lt: mesAtual.fim },
          ...(corretorIds ? { corretorId: { in: corretorIds } } : {}),
        },
        _count: { _all: true },
        _sum: { vgv: true },
      }),
      this.prisma.cadastroVenda.aggregate({
        where: {
          tenantId,
          dataVenda: { gte: mesAnterior.inicio, lt: mesAnterior.fim },
          ...(corretorIds ? { corretorId: { in: corretorIds } } : {}),
        },
        _count: { _all: true },
        _sum: { vgv: true },
      }),
    ]);
    const vendasMesTotal =
      vendasDocsMes + (cadastroMes._count._all ?? 0);
    const vendasMesAntTotal =
      vendasDocsMesAnt + (cadastroMesAnt._count._all ?? 0);
    const taxaMes = taxaConversao(vendasMesTotal, docsMes);
    const taxaMesAnt = taxaConversao(vendasMesAntTotal, docsMesAnt);
    const taxaAprovMes = taxaConversao(vendasMesTotal, aprovacoesMes);
    const taxaAprovMesAnt = taxaConversao(
      vendasMesAntTotal,
      aprovacoesMesAnt,
    );

    const brasilAgora = new Date(windows.agora.getTime() - BRASIL_UTC_OFFSET_MS);
    const ehMesCorrente =
      windows.ano === brasilAgora.getUTCFullYear() &&
      windows.mes === brasilAgora.getUTCMonth();
    /** Entradas/vendas/perdidos/VGV no mês filtrado. */
    const vgvMesTotal =
      sumVgvVendido(vgvMes) + (cadastroMes._sum.vgv ?? 0);
    const vgvMesAntTotal =
      sumVgvVendido(vgvMesAnt) + (cadastroMesAnt._sum.vgv ?? 0);

    const temRegistroNoPeriodo =
      entradasMes > 0 ||
      vendasDaEntradaMes > 0 ||
      perdidosMes > 0 ||
      vgvMesTotal > 0 ||
      vendasMesTotal > 0;
    /**
     * Indicadores de estoque/"hoje" só fazem sentido no mês corrente com dados.
     * Em período histórico/vazio, zera para não misturar com o recorte filtrado.
     */
    const mostrarSnapshotAtual = ehMesCorrente && temRegistroNoPeriodo;

    const rankingResposta = mostrarSnapshotAtual
      ? ranking
      : ranking.map((r) => ({
          ...r,
          leads: 0,
          visitas: 0,
        }));
    const equipesResposta = mostrarSnapshotAtual
      ? distribuicaoEquipes
      : distribuicaoEquipes.map((eq) => ({
          ...eq,
          leads: 0,
          clientes: 0,
          total: 0,
        }));

    return {
      periodo: {
        mesAtual: {
          inicio: mesAtual.inicio.toISOString(),
          fim: mesAtual.fim.toISOString(),
        },
        mesAnterior: {
          inicio: mesAnterior.inicio.toISOString(),
          fim: mesAnterior.fim.toISOString(),
        },
      },
      entradas: {
        hoje: mostrarSnapshotAtual ? entradasHoje : 0,
        semana: mostrarSnapshotAtual ? entradasSemana : 0,
        mes: metric(entradasMes, entradasMesAnt),
      },
      funil: mostrarSnapshotAtual
        ? funil.map((item) => ({
            etapa: item.stage,
            total: item._count._all,
          }))
        : funil.map((item) => ({
            etapa: item.stage,
            total: 0,
          })),
      /**
       * Conversão = vendas do mês ÷ documentações criadas no mês.
       * Ex.: 60 fichas de documentação e 3 vendas → 5%.
       */
      conversao: {
        entradas: metric(entradasMes, entradasMesAnt),
        documentacoes: metric(docsMes, docsMesAnt),
        aprovacoes: metric(aprovacoesMes, aprovacoesMesAnt),
        vendas: metric(vendasMesTotal, vendasMesAntTotal),
        taxa: metric(taxaMes, taxaMesAnt),
        taxaAprovacao: metric(taxaAprovMes, taxaAprovMesAnt),
        vgv: metric(vgvMesTotal, vgvMesAntTotal),
      },
      documentacaoPipeline: {
        aprovadas: metric(
          pipelineAtual.aprovadas,
          pipelineAnterior.aprovadas,
        ),
        reprovadas: metric(
          pipelineAtual.reprovadas,
          pipelineAnterior.reprovadas,
        ),
        emAnalise: metric(
          pipelineAtual.emAnalise,
          pipelineAnterior.emAnalise,
        ),
        vgv: metric(vgvMesTotal, vgvMesAntTotal),
      },
      /**
       * Comissão do mês filtrado por dataVenda.
       * Corretor → valorCorretor; gerente → valorGerente; admin → comissão líquida.
       */
      comissao: {
        total: metric(comissaoMes.total, comissaoMesAnt.total),
        aReceber: metric(comissaoMes.aReceber, comissaoMesAnt.aReceber),
        pendente: metric(comissaoMes.pendente, comissaoMesAnt.pendente),
        liberada: metric(comissaoMes.liberada, comissaoMesAnt.liberada),
        paga: metric(comissaoMes.paga, comissaoMesAnt.paga),
        vendas: metric(comissaoMes.vendas, comissaoMesAnt.vendas),
        vgv: metric(comissaoMes.vgv, comissaoMesAnt.vgv),
        papel: comissaoPapel,
      },
      atencao: {
        semDono: mostrarSnapshotAtual ? semDono : 0,
        parados: mostrarSnapshotAtual ? parados : 0,
        diasParado,
      },
      perdidos: {
        mes: metric(perdidosMes, perdidosMesAnt),
        motivos: perdidosMotivos.map((item) => {
          const motivo = item.motivoPerda ?? 'Sem motivo';
          return {
            motivo,
            ...metric(item._count._all, motivosAntMap.get(motivo) ?? 0),
          };
        }),
      },
      agenda: mostrarSnapshotAtual
        ? {
            totalHoje: agendaHoje.length,
            pendentesHoje: agendaHoje.filter(
              (a) => a.status === AgendamentoStatus.agendado,
            ).length,
            concluidosHoje: agendaHoje.filter(
              (a) => a.status === AgendamentoStatus.concluido,
            ).length,
            atrasados: agendaAtrasados,
            itens: agendaHoje.slice(0, 8).map((item) => ({
              id: item.id,
              titulo: item.titulo,
              tipo: item.tipo,
              status: item.status,
              startsAt: item.startsAt.toISOString(),
              contato: item.lead?.nome ?? null,
            })),
          }
        : {
            totalHoje: 0,
            pendentesHoje: 0,
            concluidosHoje: 0,
            atrasados: 0,
            itens: [],
          },
      ranking: rankingResposta,
      equipes: equipesResposta,
      metas: mostrarSnapshotAtual
        ? metas
        : {
            corretores: [],
            equipes: [],
            imobiliaria: { meta: 0, atual: 0, percentual: 0 },
          },
    };
  }

  /**
   * Soma as comissões lançadas com dataVenda no período.
   * Corretor → valorCorretor; gerente → valorGerente; admin → comissão líquida.
   */
  private async aggregateComissaoMes(
    tenantId: string,
    periodo: Periodo,
    opts: {
      papel: 'corretor' | 'gerente' | 'admin';
      userId: string;
      corretorIds?: string[] | null;
    },
  ): Promise<ComissaoResumo> {
    const where: Prisma.FinanceiroComissaoWhereInput = {
      tenantId,
      dataVenda: { gte: periodo.inicio, lt: periodo.fim },
    };

    if (opts.papel === 'corretor') {
      where.corretorId = opts.userId;
    } else if (opts.papel === 'gerente') {
      where.OR = [
        { gerenteId: opts.userId },
        { equipeRegistro: { gerenteId: opts.userId } },
      ];
    } else if (opts.corretorIds) {
      where.corretorId = { in: opts.corretorIds };
    }

    const rows = await this.prisma.financeiroComissao.findMany({
      where,
      select: {
        status: true,
        vgv: true,
        valorCorretor: true,
        valorGerente: true,
        comissaoLiquida: true,
      },
    });

    if (rows.length === 0) return emptyComissaoResumo();

    const valueOf = (row: (typeof rows)[number]) => {
      if (opts.papel === 'corretor') return moneyNumber(row.valorCorretor);
      if (opts.papel === 'gerente') return moneyNumber(row.valorGerente);
      return moneyNumber(row.comissaoLiquida);
    };

    const resumo = emptyComissaoResumo();
    for (const row of rows) {
      const valor = valueOf(row);
      resumo.total += valor;
      resumo.vgv += moneyNumber(row.vgv);
      resumo.vendas += 1;
      if (row.status === FinanceiroComissaoStatus.pendente) {
        resumo.pendente += valor;
      } else if (row.status === FinanceiroComissaoStatus.liberada) {
        resumo.liberada += valor;
      } else if (row.status === FinanceiroComissaoStatus.paga) {
        resumo.paga += valor;
      }
    }
    resumo.aReceber = resumo.pendente + resumo.liberada;
    return {
      total: Number(resumo.total.toFixed(2)),
      aReceber: Number(resumo.aReceber.toFixed(2)),
      pendente: Number(resumo.pendente.toFixed(2)),
      liberada: Number(resumo.liberada.toFixed(2)),
      paga: Number(resumo.paga.toFixed(2)),
      vendas: resumo.vendas,
      vgv: Number(resumo.vgv.toFixed(2)),
    };
  }

  /**
   * Vendas/VGV no período: só documentação com status vendido cuja
   * dataVenda (ou createdAt, se dataVenda vazia) cai no intervalo.
   * Não usa etapa do funil nem eventos de triagem — marcar como vendido
   * num mês com dataVenda em outro não pode mudar o mês da venda.
   */
  private async aggregateVendasPorCorretor(
    tenantId: string,
    corretorIds: string[],
    periodo: Periodo,
    opts?: { origem?: string },
  ): Promise<{ vendas: Map<string, number>; vgv: Map<string, number> }> {
    const vendas = new Map<string, number>();
    const vgv = new Map<string, number>();
    if (corretorIds.length === 0) return { vendas, vgv };

    const origem = opts?.origem?.trim() || undefined;
    const countedLeads = new Set<string>();

    const markSale = (
      leadId: string,
      corretorId: string | null | undefined,
    ): boolean => {
      if (!corretorId || countedLeads.has(leadId)) return false;
      countedLeads.add(leadId);
      vendas.set(corretorId, (vendas.get(corretorId) ?? 0) + 1);
      return true;
    };

    const addVgv = (
      corretorId: string | null | undefined,
      value: number | null | undefined,
    ) => {
      if (!corretorId || value == null || value === 0) return;
      vgv.set(corretorId, (vgv.get(corretorId) ?? 0) + value);
    };

    const corretorIdSet = new Set(corretorIds);
    const docs = await this.prisma.documentacao.findMany({
      where: {
        tenantId,
        AND: [
          documentacaoOperacionalWhere(),
          documentacaoVinculadaAoCorretorWhere(corretorIds),
          documentacaoVendaNoPeriodoWhere(periodo),
          ...(origem ? [{ lead: { origem } }] : []),
        ],
      },
      select: {
        id: true,
        leadId: true,
        corretorId: true,
        vgv: true,
        status2: true,
        lead: { select: { corretorId: true } },
      },
    });
    const seenDocs = new Set<string>();
    for (const doc of docs) {
      const temVgv = (doc.vgv ?? 0) > 0;
      if (!isStatusVendido(doc.status2) && !temVgv) continue;
      if (seenDocs.has(doc.id)) continue;
      seenDocs.add(doc.id);
      const credited =
        doc.corretorId && corretorIdSet.has(doc.corretorId)
          ? doc.corretorId
          : doc.lead?.corretorId && corretorIdSet.has(doc.lead.corretorId)
            ? doc.lead.corretorId
            : null;
      if (!credited) continue;
      if (isStatusVendido(doc.status2)) {
        markSale(doc.leadId ?? doc.id, credited);
      }
      addVgv(credited, doc.vgv);
    }

    if (!origem) {
      const avulsas = await this.prisma.cadastroVenda.findMany({
        where: {
          tenantId,
          corretorId: { in: corretorIds },
          dataVenda: { gte: periodo.inicio, lt: periodo.fim },
        },
        select: { id: true, corretorId: true, vgv: true },
      });
      for (const row of avulsas) {
        if (!row.corretorId || !corretorIdSet.has(row.corretorId)) continue;
        markSale(`cadastro:${row.id}`, row.corretorId);
        addVgv(row.corretorId, row.vgv);
      }
    }

    return { vendas, vgv };
  }

  /**
   * VGV das vendas em que o usuário é o gerente da documentação.
   * `excludeCorretorIdsByGerente` tira o que o ranking já somou pela equipe,
   * para a mesma venda não entrar duas vezes.
   */
  private async aggregateVendasPorGerente(
    tenantId: string,
    periodo: Periodo,
    opts?: {
      origem?: string;
      excludeCorretorIdsByGerente?: Map<string, Set<string>>;
    },
  ): Promise<{
    vendas: Map<string, number>;
    vgv: Map<string, number>;
    nomes: Map<string, string>;
  }> {
    const vendas = new Map<string, number>();
    const vgv = new Map<string, number>();
    const nomes = new Map<string, string>();
    const origem = opts?.origem?.trim() || undefined;
    const countedLeads = new Set<string>();

    const docs = await this.prisma.documentacao.findMany({
      where: {
        tenantId,
        gerenteId: { not: null },
        AND: [
          status2VendidoWhere(),
          documentacaoVendaNoPeriodoWhere(periodo),
          ...(origem ? [{ lead: { origem } }] : []),
        ],
      },
      select: {
        id: true,
        leadId: true,
        gerenteId: true,
        corretorId: true,
        vgv: true,
        status2: true,
        gerente: { select: { name: true } },
        lead: { select: { corretorId: true } },
      },
    });

    for (const doc of docs) {
      if (!isStatusVendido(doc.status2) || !doc.gerenteId) continue;
      const corretorId = doc.corretorId ?? doc.lead?.corretorId;
      const excluded = opts?.excludeCorretorIdsByGerente?.get(doc.gerenteId);
      if (corretorId && excluded?.has(corretorId)) continue;
      if (doc.gerente?.name) nomes.set(doc.gerenteId, doc.gerente.name);

      const saleKey = `${doc.gerenteId}:${doc.leadId ?? doc.id}`;
      if (!countedLeads.has(saleKey)) {
        countedLeads.add(saleKey);
        vendas.set(doc.gerenteId, (vendas.get(doc.gerenteId) ?? 0) + 1);
      }
      const value = moneyNumber(doc.vgv);
      if (value) {
        vgv.set(doc.gerenteId, (vgv.get(doc.gerenteId) ?? 0) + value);
      }
    }

    return { vendas, vgv, nomes };
  }

  private async buildRankingGerentes(input: {
    tenantId: string;
    equipes: Array<{
      id: string;
      name: string;
      gerente: { id: string; name: string } | null;
      membros: Array<{ id: string }>;
    }>;
    byCorretorMetrics: Map<
      string,
      {
        leads: number;
        entradas: { valor: number; valorMesAnterior: number };
        visitas: number;
        documentacoes: number;
        aprovacoes: number;
        aprovacoesAnt: number;
        vendas: { valor: number; valorMesAnterior: number };
        vgv: { valor: number; valorMesAnterior: number };
        perdidos: number;
      }
    >;
    docsAntMap: Map<string, number>;
    mesAtual: Periodo;
    mesAnterior: Periodo;
    origem?: string;
    taxaConversao: (vendas: number, documentacoes: number) => number;
  }) {
    const {
      tenantId,
      equipes,
      byCorretorMetrics,
      docsAntMap,
      mesAtual,
      mesAnterior,
      origem,
      taxaConversao,
    } = input;

    const jaContado = new Map<string, Set<string>>();
    for (const eq of equipes) {
      if (!eq.gerente) continue;
      const ids = new Set<string>();
      for (const membro of eq.membros) {
        if (byCorretorMetrics.has(membro.id)) ids.add(membro.id);
      }
      jaContado.set(eq.gerente.id, ids);
    }

    const [gerenteUsers, vendasDiretas, vendasDiretasAnt] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          tenantId,
          role: Role.gerente,
          status: UserStatus.ativo,
        },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.aggregateVendasPorGerente(tenantId, mesAtual, {
        origem,
        excludeCorretorIdsByGerente: jaContado,
      }),
      this.aggregateVendasPorGerente(tenantId, mesAnterior, {
        origem,
        excludeCorretorIdsByGerente: jaContado,
      }),
    ]);

    type Acc = {
      gerenteId: string;
      nome: string;
      equipeId: string;
      equipe: string;
      corretores: number;
      leads: number;
      entradas: number;
      entradasAnt: number;
      visitas: number;
      documentacoes: number;
      documentacoesAnt: number;
      aprovacoes: number;
      aprovacoesAnt: number;
      vendas: number;
      vendasAnt: number;
      vgv: number;
      vgvAnt: number;
      perdidos: number;
    };

    const byGerente = new Map<string, Acc>();
    const ensure = (
      gerenteId: string,
      nome: string,
      equipeId = '',
      equipe = 'Sem equipe',
      corretores = 0,
    ) => {
      const current = byGerente.get(gerenteId);
      if (current) return current;
      const created: Acc = {
        gerenteId,
        nome,
        equipeId,
        equipe,
        corretores,
        leads: 0,
        entradas: 0,
        entradasAnt: 0,
        visitas: 0,
        documentacoes: 0,
        documentacoesAnt: 0,
        aprovacoes: 0,
        aprovacoesAnt: 0,
        vendas: 0,
        vendasAnt: 0,
        vgv: 0,
        vgvAnt: 0,
        perdidos: 0,
      };
      byGerente.set(gerenteId, created);
      return created;
    };

    for (const eq of equipes) {
      if (!eq.gerente) continue;
      const row = ensure(
        eq.gerente.id,
        eq.gerente.name,
        eq.id,
        eq.name,
        eq.membros.length,
      );
      for (const membro of eq.membros) {
        const metrics = byCorretorMetrics.get(membro.id);
        if (!metrics) continue;
        row.leads += metrics.leads;
        row.entradas += metrics.entradas.valor;
        row.entradasAnt += metrics.entradas.valorMesAnterior;
        row.visitas += metrics.visitas;
        row.documentacoes += metrics.documentacoes;
        row.documentacoesAnt += docsAntMap.get(membro.id) ?? 0;
        row.aprovacoes += metrics.aprovacoes ?? 0;
        row.aprovacoesAnt += metrics.aprovacoesAnt ?? 0;
        row.vendas += metrics.vendas.valor;
        row.vendasAnt += metrics.vendas.valorMesAnterior;
        row.vgv += metrics.vgv.valor;
        row.vgvAnt += metrics.vgv.valorMesAnterior;
        row.perdidos += metrics.perdidos;
      }
    }

    for (const gerente of gerenteUsers) {
      ensure(gerente.id, gerente.name);
    }

    const aplicarDiretas = (
      pack: { vendas: Map<string, number>; vgv: Map<string, number>; nomes: Map<string, string> },
      anterior: boolean,
    ) => {
      const ids = new Set([...pack.vendas.keys(), ...pack.vgv.keys()]);
      for (const gerenteId of ids) {
        const row = ensure(
          gerenteId,
          pack.nomes.get(gerenteId) ?? 'Gerente',
        );
        if (anterior) {
          row.vendasAnt += pack.vendas.get(gerenteId) ?? 0;
          row.vgvAnt += pack.vgv.get(gerenteId) ?? 0;
        } else {
          row.vendas += pack.vendas.get(gerenteId) ?? 0;
          row.vgv += pack.vgv.get(gerenteId) ?? 0;
        }
      }
    };
    aplicarDiretas(vendasDiretas, false);
    aplicarDiretas(vendasDiretasAnt, true);

    return [...byGerente.values()]
      .sort(
        (a, b) =>
          b.vgv - a.vgv ||
          b.vendas - a.vendas ||
          b.entradas - a.entradas ||
          a.nome.localeCompare(b.nome, 'pt-BR'),
      )
      .map((row, index) => {
        const taxa = taxaConversao(row.vendas, row.documentacoes);
        const taxaAnt = taxaConversao(row.vendasAnt, row.documentacoesAnt);
        const taxaAprovacao = taxaConversao(row.vendas, row.aprovacoes);
        const taxaAprovacaoAnt = taxaConversao(
          row.vendasAnt,
          row.aprovacoesAnt,
        );
        return {
          posicao: index + 1,
          gerenteId: row.gerenteId,
          nome: row.nome,
          equipeId: row.equipeId,
          equipe: row.equipe,
          corretores: row.corretores,
          leads: row.leads,
          entradas: metric(row.entradas, row.entradasAnt),
          visitas: row.visitas,
          documentacoes: row.documentacoes,
          aprovacoes: row.aprovacoes,
          vendas: metric(row.vendas, row.vendasAnt),
          vgv: metric(row.vgv, row.vgvAnt),
          taxaConversao: metric(taxa, taxaAnt),
          taxaAprovacao: metric(taxaAprovacao, taxaAprovacaoAnt),
          perdidos: row.perdidos,
        };
      });
  }

  private async countDocumentacoesPorCorretor(
    tenantId: string,
    ids: string[],
    periodo: Periodo,
    origem?: string,
  ) {
    const empty = {
      totais: new Map<string, number>(),
      aprovacoes: new Map<string, number>(),
    };
    if (ids.length === 0) return empty;
    const rows = await this.prisma.documentacao.findMany({
      where: {
        tenantId,
        AND: [
          documentacaoOperacionalWhere(),
          documentacaoVinculadaAoCorretorWhere(ids),
          { createdAt: { gte: periodo.inicio, lt: periodo.fim } },
          ...(origem ? [{ lead: { origem } }] : []),
        ],
      },
      select: {
        corretorId: true,
        status1: true,
        lead: { select: { corretorId: true } },
      },
    });
    const totais = new Map<string, number>();
    const aprovacoes = new Map<string, number>();
    const idSet = new Set(ids);
    for (const row of rows) {
      const credited =
        row.corretorId && idSet.has(row.corretorId)
          ? row.corretorId
          : row.lead?.corretorId && idSet.has(row.lead.corretorId)
            ? row.lead.corretorId
            : null;
      if (!credited) continue;
      totais.set(credited, (totais.get(credited) ?? 0) + 1);
      if (documentacaoPipelineStatusKey(row.status1) === 'aprovadas') {
        aprovacoes.set(credited, (aprovacoes.get(credited) ?? 0) + 1);
      }
    }
    return { totais, aprovacoes };
  }

  private async buildRanking(
    tenantId: string,
    corretores: {
      id: string;
      name: string;
      equipe: { id: string; name: string } | null;
    }[],
    mesAtual: Periodo,
    mesAnterior: Periodo,
    origem?: string,
  ) {
    if (corretores.length === 0) return [];
    const ids = corretores.map((c) => c.id);
    const origemWhere = origem ? { origem } : {};

    const [leadsAtivos, visitasMes, vendasAtual, vendasAnterior] =
      await Promise.all([
        this.prisma.lead.groupBy({
          by: ['corretorId'],
          where: {
            tenantId,
            perdidoAt: null,
            corretorId: { in: ids },
            ...origemWhere,
          },
          _count: { _all: true },
        }),
        this.prisma.agendamento.groupBy({
          by: ['autorId'],
          where: {
            tenantId,
            autorId: { in: ids },
            tipo: AgendamentoTipo.visita,
            status: AgendamentoStatus.concluido,
            startsAt: { gte: mesAtual.inicio, lt: mesAtual.fim },
            ...(origem ? { lead: { origem } } : {}),
          },
          _count: { _all: true },
        }),
        this.aggregateVendasPorCorretor(tenantId, ids, mesAtual, {
          origem,
        }),
        this.aggregateVendasPorCorretor(tenantId, ids, mesAnterior, {
          origem,
        }),
      ]);

    const leadsMap = new Map(
      leadsAtivos.map((r) => [r.corretorId!, r._count._all]),
    );
    const visitasMap = new Map(
      visitasMes.map((r) => [r.autorId, r._count._all]),
    );

    return corretores
      .map((c) => ({
        corretorId: c.id,
        nome: c.name,
        equipe: c.equipe?.name ?? null,
        leads: leadsMap.get(c.id) ?? 0,
        visitas: visitasMap.get(c.id) ?? 0,
        vendas: metric(
          vendasAtual.vendas.get(c.id) ?? 0,
          vendasAnterior.vendas.get(c.id) ?? 0,
        ),
        vgv: metric(
          vendasAtual.vgv.get(c.id) ?? 0,
          vendasAnterior.vgv.get(c.id) ?? 0,
        ),
      }))
      .sort(
        (a, b) =>
          b.vgv.valor - a.vgv.valor ||
          b.vendas.valor - a.vendas.valor ||
          b.leads - a.leads,
      );
  }

  private async buildDistribuicaoEquipes(
    tenantId: string,
    equipes: {
      id: string;
      name: string;
      membros: { id: string }[];
    }[],
    corretorIds: string[],
    origem?: string,
  ) {
    if (corretorIds.length === 0) return [];

    const leads = await this.prisma.lead.groupBy({
      by: ['corretorId', 'tipo'],
      where: {
        tenantId,
        perdidoAt: null,
        corretorId: { in: corretorIds },
        ...(origem ? { origem } : {}),
      },
      _count: { _all: true },
    });

    const byCorretor = new Map<string, { leads: number; clientes: number }>();
    for (const row of leads) {
      if (!row.corretorId) continue;
      const cur = byCorretor.get(row.corretorId) ?? { leads: 0, clientes: 0 };
      if (row.tipo === ContatoTipo.cliente) cur.clientes += row._count._all;
      else cur.leads += row._count._all;
      byCorretor.set(row.corretorId, cur);
    }

    const semEquipeIds = new Set(corretorIds);
    const result = equipes.map((eq) => {
      let leadsTotal = 0;
      let clientesTotal = 0;
      for (const m of eq.membros) {
        semEquipeIds.delete(m.id);
        const cur = byCorretor.get(m.id);
        if (!cur) continue;
        leadsTotal += cur.leads;
        clientesTotal += cur.clientes;
      }
      return {
        equipeId: eq.id,
        nome: eq.name,
        corretores: eq.membros.length,
        leads: leadsTotal,
        clientes: clientesTotal,
        total: leadsTotal + clientesTotal,
      };
    });

    if (semEquipeIds.size > 0) {
      let leadsTotal = 0;
      let clientesTotal = 0;
      for (const id of semEquipeIds) {
        const cur = byCorretor.get(id);
        if (!cur) continue;
        leadsTotal += cur.leads;
        clientesTotal += cur.clientes;
      }
      result.push({
        equipeId: 'sem-equipe',
        nome: 'Sem equipe',
        corretores: semEquipeIds.size,
        leads: leadsTotal,
        clientes: clientesTotal,
        total: leadsTotal + clientesTotal,
      });
    }

    return result.sort((a, b) => b.total - a.total);
  }

  private async buildMetasProgress(
    tenantId: string,
    metas: Array<{
      id: string;
      tipo: MetaTipo;
      valor: number;
      inicio: Date;
      fim: Date;
      corretorId: string | null;
      corretor: {
        id: string;
        name: string;
        equipeId: string | null;
        equipe: { id: string; name: string } | null;
      } | null;
    }>,
  ) {
    const tipoLabel: Record<string, string> = {
      vendas: 'Vendas',
      documentacoes: 'Documentações',
      vgv: 'VGV',
    };

    const corretorItems = await Promise.all(
      metas
        .filter((meta) => meta.corretorId && meta.corretor)
        .map(async (meta) => {
          const corretorId = meta.corretorId!;
          const corretor = meta.corretor!;
          let atual = 0;
          if (meta.tipo === MetaTipo.documentacoes) {
            atual = await this.prisma.documentacao.count({
              where: {
                tenantId,
                corretorId,
                createdAt: { gte: meta.inicio, lt: meta.fim },
                AND: [documentacaoOperacionalWhere()],
              },
            });
          } else {
            const agg = await this.aggregateVendasPorCorretor(
              tenantId,
              [corretorId],
              { inicio: meta.inicio, fim: meta.fim },
            );
            atual =
              meta.tipo === MetaTipo.vendas
                ? (agg.vendas.get(corretorId) ?? 0)
                : (agg.vgv.get(corretorId) ?? 0);
          }
          return {
            id: meta.id,
            tipo: meta.tipo,
            valor: meta.valor,
            atual,
            percentual: Math.min(100, Math.round((atual / meta.valor) * 100)),
            corretorId,
            corretorNome: corretor.name,
            equipeId: corretor.equipeId,
            equipeNome: corretor.equipe?.name ?? null,
          };
        }),
    );

    const imobiliariaItems = await Promise.all(
      metas
        .filter((meta) => !meta.corretorId)
        .map(async (meta) => {
          let atual = 0;
          if (meta.tipo === MetaTipo.documentacoes) {
            atual = await this.prisma.documentacao.count({
              where: {
                tenantId,
                createdAt: { gte: meta.inicio, lt: meta.fim },
                AND: [documentacaoOperacionalWhere()],
              },
            });
          } else {
            const docs = await this.prisma.documentacao.findMany({
              where: {
                tenantId,
                AND: [
                  documentacaoOperacionalWhere(),
                  documentacaoVendaNoPeriodoWhere({
                    inicio: meta.inicio,
                    fim: meta.fim,
                  }),
                ],
              },
              select: { id: true, status2: true, vgv: true },
            });
            const seen = new Set<string>();
            for (const doc of docs) {
              if (!isStatusVendido(doc.status2) || seen.has(doc.id)) continue;
              seen.add(doc.id);
              if (meta.tipo === MetaTipo.vendas) atual += 1;
              else atual += Number(doc.vgv ?? 0);
            }
          }
          return {
            id: meta.id,
            tipo: meta.tipo,
            valor: meta.valor,
            atual,
            percentual: Math.min(100, Math.round((atual / meta.valor) * 100)),
            corretorId: meta.id,
            corretorNome: tipoLabel[meta.tipo] ?? meta.tipo,
            equipeId: null as string | null,
            equipeNome: null as string | null,
          };
        }),
    );

    const items = [...corretorItems, ...imobiliariaItems];

    const porEquipe = new Map<
      string,
      { equipeId: string; nome: string; meta: number; atual: number }
    >();
    let metaImob = 0;
    let atualImob = 0;
    for (const item of items) {
      metaImob += item.valor;
      atualImob += item.atual;
      if (!item.equipeId && item.corretorId === item.id) {
        // Meta de imobiliária/solo — entra só no consolidado.
        continue;
      }
      const key = item.equipeId ?? 'sem-equipe';
      const nome = item.equipeNome ?? 'Sem equipe';
      const cur = porEquipe.get(key) ?? {
        equipeId: key,
        nome,
        meta: 0,
        atual: 0,
      };
      cur.meta += item.valor;
      cur.atual += item.atual;
      porEquipe.set(key, cur);
    }

    return {
      corretores: items,
      equipes: [...porEquipe.values()].map((e) => ({
        ...e,
        percentual:
          e.meta === 0 ? 0 : Math.min(100, Math.round((e.atual / e.meta) * 100)),
      })),
      imobiliaria: {
        meta: metaImob,
        atual: atualImob,
        percentual:
          metaImob === 0
            ? 0
            : Math.min(100, Math.round((atualImob / metaImob) * 100)),
      },
    };
  }

  /**
   * Ranking mensal completo: corretores (escopo da equipe) + gerentes (só admin).
   */
  async esteiraCorretor(
    corretorId: string,
    requester: AuthenticatedUser,
    filtros: {
      mes?: number;
      ano?: number;
      origem?: string;
      granularidade?: PeriodoGranularidade;
    } = {},
  ) {
    await this.assertDashboardGerencial(requester, [
      'dashboard',
      'corretores',
    ]);

    const tenantId = requireTenantId(requester);
    const allowed = await this.teamScope.canAccessCorretor(
      requester,
      corretorId,
    );
    if (!allowed) {
      throw new ForbiddenException(
        'Você não tem acesso aos dados deste corretor.',
      );
    }

    const [corretor, ranking] = await Promise.all([
      this.prisma.user.findFirst({
        where: {
          id: corretorId,
          tenantId,
          role: { in: [Role.corretor, Role.treinee] },
          status: UserStatus.ativo,
        },
        select: { id: true, name: true },
      }),
      this.rankingCompleto(requester, filtros),
    ]);
    if (!corretor) throw new NotFoundException('Corretor não encontrado.');

    const { mesAtual } = janelasBrasil({
      mes: filtros.mes,
      ano: filtros.ano,
      granularidade: filtros.granularidade,
    });
    const leads = await this.prisma.lead.findMany({
      where: {
        tenantId,
        corretorId,
        perdidoAt: null,
        createdAt: { gte: mesAtual.inicio, lt: mesAtual.fim },
        ...(filtros.origem?.trim() ? { origem: filtros.origem.trim() } : {}),
      },
      select: {
        id: true,
        nome: true,
        stage: true,
        prioridade: true,
        createdAt: true,
        updatedAt: true,
        empreendimento: { select: { id: true, nome: true } },
      },
      orderBy: { updatedAt: 'asc' },
    });

    const documentos = await this.prisma.documentacao.findMany({
      where: {
        tenantId,
        corretorId,
        createdAt: { gte: mesAtual.inicio, lt: mesAtual.fim },
      },
      select: {
        id: true,
        nome: true,
        status1: true,
        status2: true,
        createdAt: true,
        updatedAt: true,
        empreendimento: { select: { id: true, nome: true } },
      },
    });
    const etapasDocumentacao = [
      {
        slug: 'enviados',
        label: 'Enviados para análise',
        contatos: documentos,
      },
      {
        slug: 'analise',
        label: 'Em análise',
        contatos: documentos.filter((doc) => isStatusAnalise(doc.status1)),
      },
      {
        slug: 'aprovados',
        label: 'Aprovados',
        contatos: documentos.filter((doc) => isStatusAprovado(doc.status1)),
      },
      {
        slug: 'reprovados',
        label: 'Reprovados',
        contatos: documentos.filter((doc) => isStatusReprovado(doc.status1)),
      },
      {
        slug: 'vendidos',
        label: 'Vendas',
        contatos: documentos.filter((doc) => isStatusVendido(doc.status2)),
      },
    ].map((etapa) => ({
      id: etapa.slug,
      ...etapa,
      total: etapa.contatos.length,
    }));
    const rankingCorretor =
      ranking.corretores.find((item) => item.corretorId === corretorId) ??
      null;
    const oldest = leads[0] ?? null;
    const diasParado = oldest
      ? Math.max(
          0,
          Math.floor(
            (Date.now() - oldest.updatedAt.getTime()) / (24 * 60 * 60 * 1000),
          ),
        )
      : 0;

    return {
      corretor,
      periodo: {
        inicio: mesAtual.inicio.toISOString(),
        fim: mesAtual.fim.toISOString(),
      },
      indicadores: {
        vgv: rankingCorretor?.vgv.valor ?? 0,
        conversao: rankingCorretor?.taxaConversao.valor ?? 0,
        vendas: rankingCorretor?.vendas.valor ?? 0,
        contatos: leads.length,
        maisAntigo: oldest
          ? { id: oldest.id, nome: oldest.nome, diasParado }
          : null,
      },
      etapas: etapasDocumentacao,
    };
  }

  async rankingCompleto(
    requester: AuthenticatedUser,
    filtros: {
      mes?: number;
      ano?: number;
      origem?: string;
      granularidade?: PeriodoGranularidade;
      faixa?: RankingFaixa;
      de?: string;
      ate?: string;
    } = {},
  ) {
    await this.assertDashboardGerencial(requester, [
      'dashboard',
      'corretores',
      'taxaConversao',
    ]);

    const tenantId = requireTenantId(requester);
    const { mesAtual, mesAnterior, agora } = janelasBrasil({
      mes: filtros.mes,
      ano: filtros.ano,
      granularidade: filtros.granularidade,
      faixa: filtros.faixa,
      de: filtros.de,
      ate: filtros.ate,
    });
    const origem = filtros.origem?.trim() || undefined;
    const origemWhere = origem ? { origem } : {};
    const corretorIds = await this.teamScope.getVisibleCorretorIds(requester);
    const taxaConversao = (vendas: number, documentacoes: number) =>
      documentacoes === 0
        ? 0
        : Number(((vendas / documentacoes) * 100).toFixed(1));

    const [corretores, equipes, metasAtivas] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          tenantId,
          role: { in: [Role.corretor, Role.treinee] },
          status: UserStatus.ativo,
          ...(corretorIds ? { id: { in: corretorIds } } : {}),
        },
        select: {
          id: true,
          name: true,
          equipeId: true,
          equipe: {
            select: {
              id: true,
              name: true,
              gerenteId: true,
              gerente: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.equipe.findMany({
        where: {
          tenantId,
          status: UserStatus.ativo,
          ...(requester.role === Role.gerente
            ? { gerenteId: requester.id }
            : corretorIds
              ? { membros: { some: { id: { in: corretorIds } } } }
              : {}),
        },
        select: {
          id: true,
          name: true,
          gerenteId: true,
          gerente: { select: { id: true, name: true } },
          membros: {
            where: {
              role: { in: [Role.corretor, Role.treinee] },
              status: UserStatus.ativo,
            },
            select: { id: true },
          },
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.meta.findMany({
        where: {
          tenantId,
          escopo: { in: [MetaEscopo.corretor, MetaEscopo.imobiliaria] },
          inicio: { lte: agora },
          fim: { gt: agora },
          periodo: MetaPeriodo.mensal,
          ...(corretorIds
            ? {
                OR: [
                  { escopo: MetaEscopo.imobiliaria },
                  { corretorId: { in: corretorIds } },
                ],
              }
            : {}),
        },
        include: {
          corretor: {
            select: {
              id: true,
              name: true,
              equipeId: true,
              equipe: { select: { id: true, name: true } },
            },
          },
        },
      }),
    ]);

    const ids = corretores.map((c) => c.id);
    const emptyGroup = Promise.resolve(
      [] as Array<{
        corretorId?: string | null;
        autorId?: string;
        _count: { _all: number };
        _sum?: { vgv: number | null };
      }>,
    );

    const [
      leadsAtivos,
      entradasMes,
      entradasMesAnt,
      visitasMes,
      docsMes,
      docsMesAnt,
      vendasAtualAgg,
      vendasAnteriorAgg,
      perdidosMes,
      metas,
    ] = await Promise.all([
      ids.length === 0
        ? emptyGroup
        : this.prisma.lead.groupBy({
            by: ['corretorId'],
            where: {
              tenantId,
              perdidoAt: null,
              corretorId: { in: ids },
              ...origemWhere,
            },
            _count: { _all: true },
          }),
      ids.length === 0
        ? emptyGroup
        : this.prisma.lead.groupBy({
            by: ['corretorId'],
            where: {
              tenantId,
              corretorId: { in: ids },
              createdAt: { gte: mesAtual.inicio, lt: mesAtual.fim },
              ...origemWhere,
            },
            _count: { _all: true },
          }),
      ids.length === 0
        ? emptyGroup
        : this.prisma.lead.groupBy({
            by: ['corretorId'],
            where: {
              tenantId,
              corretorId: { in: ids },
              createdAt: { gte: mesAnterior.inicio, lt: mesAnterior.fim },
              ...origemWhere,
            },
            _count: { _all: true },
          }),
      ids.length === 0
        ? emptyGroup
        : this.prisma.agendamento.groupBy({
            by: ['autorId'],
            where: {
              tenantId,
              autorId: { in: ids },
              tipo: AgendamentoTipo.visita,
              status: AgendamentoStatus.concluido,
              startsAt: { gte: mesAtual.inicio, lt: mesAtual.fim },
              ...(origem ? { lead: { origem } } : {}),
            },
            _count: { _all: true },
          }),
      this.countDocumentacoesPorCorretor(tenantId, ids, mesAtual, origem),
      this.countDocumentacoesPorCorretor(
        tenantId,
        ids,
        mesAnterior,
        origem,
      ),
      this.aggregateVendasPorCorretor(tenantId, ids, mesAtual, {
        origem,
      }),
      this.aggregateVendasPorCorretor(tenantId, ids, mesAnterior, { origem }),
      ids.length === 0
        ? emptyGroup
        : this.prisma.lead.groupBy({
            by: ['corretorId'],
            where: {
              tenantId,
              corretorId: { in: ids },
              perdidoAt: { gte: mesAtual.inicio, lt: mesAtual.fim },
              ...origemWhere,
            },
            _count: { _all: true },
          }),
      this.buildMetasProgress(tenantId, metasAtivas),
    ]);

    const toMap = (
      rows: Array<{ corretorId?: string | null; _count: { _all: number } }>,
    ) =>
      new Map(
        rows
          .filter((r) => r.corretorId)
          .map((r) => [r.corretorId!, r._count._all]),
      );

    const leadsMap = toMap(leadsAtivos);
    const entradasMap = toMap(entradasMes);
    const entradasAntMap = toMap(entradasMesAnt);
    const visitasMap = new Map(
      visitasMes.map((r) => [r.autorId!, r._count._all]),
    );
    const docsMap = docsMes.totais;
    const docsAntMap = docsMesAnt.totais;
    const aprovMap = docsMes.aprovacoes;
    const aprovAntMap = docsMesAnt.aprovacoes;
    const vendasMap = vendasAtualAgg.vendas;
    const vendasAntMap = vendasAnteriorAgg.vendas;
    const vgvMap = vendasAtualAgg.vgv;
    const vgvAntMap = vendasAnteriorAgg.vgv;
    const perdidosMap = toMap(perdidosMes);

    const metaByCorretor = new Map(
      metas.corretores.map((m) => [
        m.corretorId,
        {
          tipo: m.tipo,
          valor: m.valor,
          atual: m.atual,
          percentual: m.percentual,
        },
      ]),
    );

    const rankingCorretores = corretores
      .map((c) => {
        const entradas = entradasMap.get(c.id) ?? 0;
        const vendas = vendasMap.get(c.id) ?? 0;
        const vendasAnt = vendasAntMap.get(c.id) ?? 0;
        const entradasAnt = entradasAntMap.get(c.id) ?? 0;
        const documentacoes = docsMap.get(c.id) ?? 0;
        const documentacoesAnt = docsAntMap.get(c.id) ?? 0;
        const aprovacoes = aprovMap.get(c.id) ?? 0;
        const aprovacoesAnt = aprovAntMap.get(c.id) ?? 0;
        const taxa = taxaConversao(vendas, documentacoes);
        const taxaAnt = taxaConversao(vendasAnt, documentacoesAnt);
        const taxaAprovacao = taxaConversao(vendas, aprovacoes);
        const taxaAprovacaoAnt = taxaConversao(vendasAnt, aprovacoesAnt);
        return {
          corretorId: c.id,
          nome: c.name,
          equipeId: c.equipe?.id ?? null,
          equipe: c.equipe?.name ?? null,
          gerenteId: c.equipe?.gerente?.id ?? null,
          gerente: c.equipe?.gerente?.name ?? null,
          leads: leadsMap.get(c.id) ?? 0,
          entradas: metric(entradas, entradasAnt),
          visitas: visitasMap.get(c.id) ?? 0,
          documentacoes,
          aprovacoes,
          aprovacoesAnt,
          vendas: metric(vendas, vendasAnt),
          vgv: metric(vgvMap.get(c.id) ?? 0, vgvAntMap.get(c.id) ?? 0),
          taxaConversao: metric(taxa, taxaAnt),
          taxaAprovacao: metric(taxaAprovacao, taxaAprovacaoAnt),
          perdidos: perdidosMap.get(c.id) ?? 0,
          meta: metaByCorretor.get(c.id) ?? null,
        };
      })
      .sort(
        (a, b) =>
          b.vgv.valor - a.vgv.valor ||
          b.vendas.valor - a.vendas.valor ||
          b.entradas.valor - a.entradas.valor ||
          b.leads - a.leads,
      )
      .map((row, index) => ({ posicao: index + 1, ...row }));

    const byCorretorMetrics = new Map(
      rankingCorretores.map((r) => [r.corretorId, r]),
    );

    // Ranking/pódio de gerentes: só admin do tenant (e super_admin no tenant).
    // A equipe soma o VGV dos corretores. Vendas em que o gerente é o
    // responsável, mesmo sem equipe, entram no VGV dele sem duplicar.
    const rankingGerentes =
      requester.role !== Role.admin && requester.role !== Role.super_admin
        ? []
        : await this.buildRankingGerentes({
            tenantId,
            equipes,
            byCorretorMetrics,
            docsAntMap,
            mesAtual,
            mesAnterior,
            origem,
            taxaConversao,
          });

    const totais = rankingCorretores.reduce(
      (acc, r) => {
        acc.entradas += r.entradas.valor || 0;
        acc.documentacoes += r.documentacoes || 0;
        acc.aprovacoes += r.aprovacoes || 0;
        acc.vendas += r.vendas.valor || 0;
        acc.vgv += r.vgv.valor || 0;
        acc.visitas += r.visitas || 0;
        acc.perdidos += r.perdidos || 0;
        return acc;
      },
      {
        entradas: 0,
        documentacoes: 0,
        aprovacoes: 0,
        vendas: 0,
        vgv: 0,
        visitas: 0,
        perdidos: 0,
      },
    );
    const vendasPorConstrutora = await this.prisma.documentacao.findMany({
      where: {
        tenantId,
        AND: [
          status2VendidoWhere(),
          documentacaoVendaNoPeriodoWhere(mesAtual),
          ...(origem ? [{ lead: { origem } }] : []),
          ...(corretorIds
            ? [documentacaoVinculadaAoCorretorWhere(corretorIds)]
            : []),
        ],
      },
      select: {
        vgv: true,
        status2: true,
        construtora: { select: { id: true, nome: true } },
        empreendimento: {
          select: { construtora: { select: { id: true, nome: true } } },
        },
        lead: {
          select: { construtora: { select: { id: true, nome: true } } },
        },
      },
    });
    const construtoraMap = vendasPorConstrutora.reduce(
      (map, item) => {
        if (!isStatusVendido(item.status2)) return map;
        const construtora =
          item.construtora ??
          item.empreendimento?.construtora ??
          item.lead?.construtora;
        if (!construtora) return map;
        const current = map.get(construtora.id) ?? {
          construtoraId: construtora.id,
          nome: construtora.nome,
          vendas: 0,
          vgv: 0,
        };
        current.vendas += 1;
        current.vgv += moneyNumber(item.vgv);
        map.set(construtora.id, current);
        return map;
      },
      new Map<
        string,
        { construtoraId: string; nome: string; vendas: number; vgv: number }
      >(),
    );
    const construtoras = Array.from(construtoraMap.values())
      .sort((a, b) => b.vgv - a.vgv || b.vendas - a.vendas)
      .slice(0, 10)
      .map((item, index) => ({ posicao: index + 1, ...item }));

    return {
      periodo: {
        mesAtual: {
          inicio: mesAtual.inicio.toISOString(),
          fim: mesAtual.fim.toISOString(),
        },
        mesAnterior: {
          inicio: mesAnterior.inicio.toISOString(),
          fim: mesAnterior.fim.toISOString(),
        },
      },
      totais: {
        ...totais,
        taxaConversao: taxaConversao(totais.vendas, totais.documentacoes),
        taxaAprovacao: taxaConversao(totais.vendas, totais.aprovacoes),
        corretores: rankingCorretores.length,
        gerentes: rankingGerentes.length,
      },
      corretores: rankingCorretores,
      gerentes: rankingGerentes,
      construtoras,
    };
  }

  async rankingCategoria(
    requester: AuthenticatedUser,
    filtros: {
      categoria?: RankingCategoria;
      mes?: number;
      ano?: number;
      granularidade?: PeriodoGranularidade;
      faixa?: RankingFaixa;
      de?: string;
      ate?: string;
    } = {},
  ) {
    await this.assertDashboardGerencial(requester, [
      'dashboard',
      'corretores',
    ]);
    const categoria: Exclude<RankingCategoria, 'lancamentos'> =
      filtros.categoria && filtros.categoria !== 'lancamentos'
        ? filtros.categoria
        : 'documentacoes';
    const tenantId = requireTenantId(requester);
    const { mesAtual } = janelasBrasil({
      mes: filtros.mes,
      ano: filtros.ano,
      granularidade: filtros.granularidade,
      faixa: filtros.faixa,
      de: filtros.de,
      ate: filtros.ate,
    });
    const corretorIds = await this.teamScope.getVisibleCorretorIds(requester);
    const corretores = await this.prisma.user.findMany({
      where: {
        tenantId,
        role: { in: [Role.corretor, Role.treinee] },
        status: UserStatus.ativo,
        ...(corretorIds ? { id: { in: corretorIds } } : {}),
      },
      select: {
        id: true,
        name: true,
        equipe: { select: { name: true } },
      },
      orderBy: { name: 'asc' },
    });
    const ids = corretores.map((c) => c.id);
    const valores = await this.contarIndicadorRanking(
      tenantId,
      ids,
      mesAtual,
      categoria,
    );
    const linhas = corretores
      .map((c) => ({
        posicao: 0,
        corretorId: c.id,
        nome: c.name,
        equipe: c.equipe?.name ?? null,
        valor: valores.get(c.id) ?? 0,
      }))
      .sort(
        (a, b) => b.valor - a.valor || a.nome.localeCompare(b.nome, 'pt-BR'),
      )
      .map((row, index) => ({ ...row, posicao: index + 1 }));
    const meta = RANKING_CATEGORIA_META[categoria];
    const total = linhas.reduce((acc, row) => acc + row.valor, 0);
    return {
      categoria,
      indicador: meta.indicador,
      unidade: 'count' as const,
      regra: meta.regra,
      podeVerRegras:
        requester.role === Role.admin || requester.role === Role.super_admin,
      periodo: {
        inicio: mesAtual.inicio.toISOString(),
        fim: mesAtual.fim.toISOString(),
      },
      totais: { corretores: linhas.length, valor: total },
      linhas,
    };
  }

  private async contarIndicadorRanking(
    tenantId: string,
    ids: string[],
    periodo: Periodo,
    categoria: RankingCategoria,
  ) {
    const empty = new Map<string, number>();
    if (ids.length === 0 || categoria === 'lancamentos') return empty;
    if (categoria === 'locacoes') return empty;
    if (categoria === 'documentacoes') {
      const docs = await this.countDocumentacoesPorCorretor(
        tenantId,
        ids,
        periodo,
      );
      return docs.totais;
    }
    if (categoria === 'captacoes') {
      const rows = await this.prisma.captacao.groupBy({
        by: ['responsavelId'],
        where: {
          tenantId,
          responsavelId: { in: ids },
          createdAt: { gte: periodo.inicio, lt: periodo.fim },
        },
        _count: { _all: true },
      });
      return new Map(rows.map((row) => [row.responsavelId, row._count._all]));
    }
    if (categoria === 'visitas') {
      const [agenda, usados] = await Promise.all([
        this.prisma.agendamento.findMany({
          where: {
            tenantId,
            tipo: AgendamentoTipo.visita,
            status: AgendamentoStatus.concluido,
            startsAt: { gte: periodo.inicio, lt: periodo.fim },
            OR: [
              { atribuidoParaId: { in: ids } },
              { autorId: { in: ids } },
            ],
          },
          select: { id: true, autorId: true, atribuidoParaId: true },
        }),
        this.prisma.vendaUsadoVisita.findMany({
          where: {
            tenantId,
            responsavelId: { in: ids },
            status: VendaUsadoVisitaStatus.realizada,
            dataHora: { gte: periodo.inicio, lt: periodo.fim },
          },
          select: { id: true, responsavelId: true },
        }),
      ]);
      const idSet = new Set(ids);
      const seenAgenda = new Set<string>();
      const counts = new Map<string, number>();
      const bump = (corretorId: string) => {
        counts.set(corretorId, (counts.get(corretorId) ?? 0) + 1);
      };
      for (const row of agenda) {
        if (seenAgenda.has(row.id)) continue;
        seenAgenda.add(row.id);
        const credited =
          row.atribuidoParaId && idSet.has(row.atribuidoParaId)
            ? row.atribuidoParaId
            : idSet.has(row.autorId)
              ? row.autorId
              : null;
        if (credited) bump(credited);
      }
      const seenUsado = new Set<string>();
      for (const row of usados) {
        if (seenUsado.has(row.id)) continue;
        seenUsado.add(row.id);
        bump(row.responsavelId);
      }
      return counts;
    }
    const fechamentos = await this.prisma.vendaUsadoFechamento.findMany({
      where: {
        tenantId,
        status: VendaUsadoFechamentoStatus.concluido,
        canceladoAt: null,
        responsavelId: { in: ids },
        OR: [
          { concluidoAt: { gte: periodo.inicio, lt: periodo.fim } },
          {
            concluidoAt: null,
            updatedAt: { gte: periodo.inicio, lt: periodo.fim },
          },
        ],
      },
      select: { vendaUsadoId: true, responsavelId: true },
    });
    const seenVenda = new Set<string>();
    const counts = new Map<string, number>();
    for (const row of fechamentos) {
      if (seenVenda.has(row.vendaUsadoId)) continue;
      seenVenda.add(row.vendaUsadoId);
      counts.set(
        row.responsavelId,
        (counts.get(row.responsavelId) ?? 0) + 1,
      );
    }
    return counts;
  }

  async listVendasCorretor(
    corretorId: string,
    requester: AuthenticatedUser,
    filtros: {
      mes?: number;
      ano?: number;
      granularidade?: PeriodoGranularidade;
      faixa?: RankingFaixa;
      de?: string;
      ate?: string;
    } = {},
  ) {
    await this.assertDashboardGerencial(requester, [
      'dashboard',
      'corretores',
    ]);
    const allowed = await this.teamScope.canAccessCorretor(
      requester,
      corretorId,
    );
    if (!allowed) {
      throw new ForbiddenException('Corretor fora do seu escopo.');
    }

    const tenantId = requireTenantId(requester);
    const { mesAtual } = janelasBrasil({
      mes: filtros.mes,
      ano: filtros.ano,
      granularidade: filtros.granularidade,
      faixa: filtros.faixa,
      de: filtros.de,
      ate: filtros.ate,
    });
    const corretor = await this.prisma.user.findFirst({
      where: { id: corretorId, tenantId },
      select: { id: true, name: true, creci: true },
    });
    if (!corretor) {
      throw new NotFoundException('Corretor não encontrado.');
    }

    const rows = await this.prisma.documentacao.findMany({
      where: {
        tenantId,
        AND: [
          status2VendidoWhere(),
          documentacaoVendaNoPeriodoWhere(mesAtual),
          documentacaoVinculadaAoCorretorWhere(corretorId),
        ],
      },
      select: {
        id: true,
        nome: true,
        vgv: true,
        dataVenda: true,
        createdAt: true,
        status2: true,
        corretorId: true,
        construtora: { select: { nome: true } },
        gerente: { select: { name: true } },
        empreendimento: {
          select: {
            nome: true,
            construtora: { select: { nome: true } },
          },
        },
        corretor: {
          select: {
            id: true,
            name: true,
            creci: true,
            equipe: { select: { gerente: { select: { name: true } } } },
          },
        },
        lead: {
          select: {
            construtora: { select: { nome: true } },
            corretor: {
              select: {
                id: true,
                name: true,
                creci: true,
                equipe: { select: { gerente: { select: { name: true } } } },
              },
            },
            propostas: {
              where: { clienteCpf: { not: null } },
              select: { clienteCpf: true },
              orderBy: { updatedAt: 'desc' },
              take: 1,
            },
          },
        },
      },
      orderBy: [{ dataVenda: 'desc' }, { createdAt: 'desc' }],
    });

    const items = rows
      .filter((row) => isStatusVendido(row.status2))
      .filter((row) => {
        const creditedId = row.corretorId ?? row.lead?.corretor?.id ?? null;
        return creditedId === corretorId;
      })
      .map((row) => {
        const credited = row.corretor ?? row.lead?.corretor;
        return {
          id: row.id,
          corretorId: credited?.id ?? corretor.id,
          corretor: credited?.name ?? corretor.name,
          creci: credited?.creci ?? corretor.creci,
          gerente:
            row.gerente?.name ??
            credited?.equipe?.gerente?.name ??
            null,
          construtora:
            row.construtora?.nome ??
            row.empreendimento?.construtora?.nome ??
            row.lead?.construtora?.nome ??
            null,
          empreendimento: row.empreendimento?.nome ?? null,
          vgv: moneyNumber(row.vgv),
          cliente: row.nome,
          clienteCpf: row.lead?.propostas[0]?.clienteCpf ?? null,
          dataVenda: (row.dataVenda ?? row.createdAt).toISOString().slice(0, 10),
        };
      });

    return {
      corretor,
      totais: {
        vendas: items.length,
        vgv: items.reduce((sum, item) => sum + item.vgv, 0),
      },
      items,
    };
  }

  private async assertDashboardGerencial(
    requester: AuthenticatedUser,
    moduleKeys: readonly string[] = ['dashboard'],
  ) {
    if (
      requester.role === Role.admin ||
      requester.role === Role.gerente ||
      requester.role === Role.super_admin
    ) {
      return;
    }
    if (hasAnyUserModule(requester.role, requester.permissions, moduleKeys)) {
      return;
    }
    const row = await this.prisma.user.findUnique({
      where: { id: requester.id },
      select: { role: true, permissions: true },
    });
    if (
      row &&
      hasAnyUserModule(
        row.role,
        sanitizeUserPermissions(row.permissions),
        moduleKeys,
      )
    ) {
      return;
    }
    throw new ForbiddenException(
      'Você não tem permissão para o dashboard gerencial.',
    );
  }
}
