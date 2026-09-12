import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  FunilEtapaPapel,
  NotificacaoTipo,
  Prisma,
  PropostaStatus,
  Role,
  TriagemOrigem,
  UserStatus,
  PrazoUnidade,
  AgendamentoTipo,
  AgendamentoStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TeamScopeService } from '../../equipes/team-scope.service';
import { NotificacoesService } from '../../notificacoes/notificacoes.service';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { requireTenantId } from '../../common/utils/tenant';
import { hasUserModule } from '../../common/utils/user-permissions';
import { AdiarPrazoDto } from '../dto/adiar-prazo.dto';
import {
  addPrazo,
  alertaProximoAt,
  DEFAULT_ALERTA_PERCENT,
  DEFAULT_INATIVIDADE_UNIDADE,
  DEFAULT_INATIVIDADE_VALOR,
  fingerprintPrazo,
  formatDurationPt,
  formatPrazoCurto,
  isEtapaTerminal,
  prazoToMs,
} from './prazo.util';
import type {
  CorretorMonitoramento,
  LeadMonitoramento,
  LeadPrazoAdiamentoView,
  MonitoramentoFiltro,
  MotivoSemMovimentacao,
  ProblemaMonitoramento,
  TarefaAtrasadaResumo,
} from './lead-monitoramento.types';

const MOTIVO_LABEL: Record<MotivoSemMovimentacao, string> = {
  sem_status: 'Sem alteração de status',
  sem_triagem: 'Sem atualização na triagem',
  sem_atividade: 'Sem atividade',
  sem_tarefa: 'Sem tarefa',
};

/** Janela de alerta antes do vencimento da proposta (3 dias). */
const PROPOSTA_ALERTA_ANTECEDENCIA_MS = 3 * 86_400_000;

function overdueTarefaWhere(now: Date): Prisma.AgendamentoWhereInput {
  return {
    tipo: AgendamentoTipo.tarefa,
    status: AgendamentoStatus.agendado,
    OR: [
      { endsAt: { lt: now } },
      { AND: [{ endsAt: null }, { startsAt: { lt: now } }] },
    ],
  };
}

function formatTarefaPrazo(startsAt: Date, endsAt: Date | null): string {
  const when = endsAt ?? startsAt;
  return when.toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

type EtapaCtx = {
  slug: string;
  label: string;
  papel: FunilEtapaPapel | null;
  prazoValor: number | null;
  prazoUnidade: PrazoUnidade;
  alertaAntecedenciaPercent: number;
};

type FunilCtx = {
  inatividadeMs: number;
  inatividadeValor: number;
  inatividadeUnidade: PrazoUnidade;
  etapasBySlug: Map<string, EtapaCtx>;
  terminalSlugs: string[];
};

export type LeadTimingFields = {
  stageEnteredAt: Date;
  lastStageChangeAt: Date;
  lastMovementAt: Date;
  prazoAdiado: boolean;
  prazoDueAt: Date | null;
  alertaProximoAt: Date | null;
};

export type LeadFollowUpFields = {
  lastMovementAt: Date;
  lastTriagemAt: Date;
  prazoAdiado: boolean;
  prazoDueAt: Date | null;
  alertaProximoAt: Date | null;
};

type LeadTimingRow = {
  id: string;
  nome: string;
  stage: string;
  corretorId: string | null;
  equipeId: string | null;
  createdAt: Date;
  stageEnteredAt: Date;
  lastMovementAt: Date;
  lastStageChangeAt: Date | null;
  lastTriagemAt: Date | null;
  lastTarefaAt: Date | null;
  lastAtividadeAt: Date | null;
  prazoDueAt: Date | null;
  alertaProximoAt: Date | null;
  prazoAdiado: boolean;
  corretor?: { id: string; name: string } | null;
};

export const leadTimingSelect = {
  stageEnteredAt: true,
  lastMovementAt: true,
  lastStageChangeAt: true,
  lastTriagemAt: true,
  lastTarefaAt: true,
  lastAtividadeAt: true,
  prazoDueAt: true,
  alertaProximoAt: true,
  prazoAdiado: true,
} satisfies Prisma.LeadSelect;

@Injectable()
export class LeadMonitoramentoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teamScope: TeamScopeService,
    private readonly notificacoes: NotificacoesService,
  ) {}

  async loadFunilContext(tenantId: string): Promise<FunilCtx> {
    const funilSelect = {
      inatividadeValor: true,
      inatividadeUnidade: true,
      etapas: {
        where: { active: true },
        select: {
          slug: true,
          label: true,
          papel: true,
          prazoValor: true,
          prazoUnidade: true,
          alertaAntecedenciaPercent: true,
        },
      },
    } as const;

    const funil =
      (await this.prisma.funil.findFirst({
        where: { tenantId, tipo: 'comercial', ativo: true },
        orderBy: { updatedAt: 'desc' },
        select: funilSelect,
      })) ??
      (await this.prisma.funil.findFirst({
        where: { tenantId, tipo: 'comercial' },
        orderBy: { updatedAt: 'desc' },
        select: funilSelect,
      }));

    const etapasBySlug = new Map<string, EtapaCtx>();
    const terminalSlugs: string[] = [];
    for (const e of funil?.etapas ?? []) {
      etapasBySlug.set(e.slug, e);
      if (isEtapaTerminal(e.papel)) terminalSlugs.push(e.slug);
    }

    const inatividadeValor =
      funil?.inatividadeValor ?? DEFAULT_INATIVIDADE_VALOR;
    const inatividadeUnidade =
      funil?.inatividadeUnidade ?? DEFAULT_INATIVIDADE_UNIDADE;
    const inatividadeMs = prazoToMs(inatividadeValor, inatividadeUnidade);

    return {
      inatividadeMs,
      inatividadeValor,
      inatividadeUnidade,
      etapasBySlug,
      terminalSlugs,
    };
  }

  async stageChangeData(
    tenantId: string,
    stage: string,
    now = new Date(),
  ): Promise<LeadTimingFields> {
    const ctx = await this.loadFunilContext(tenantId);
    const etapa = ctx.etapasBySlug.get(stage) ?? null;
    const prazo = this.prazoFieldsForEtapa(now, etapa);
    return {
      stageEnteredAt: now,
      lastStageChangeAt: now,
      lastMovementAt: now,
      prazoAdiado: false,
      ...prazo,
    };
  }

  /** Novo relato na mesma etapa: reinicia o SLA sem alterar a entrada na etapa. */
  async followUpData(
    tenantId: string,
    stage: string,
    now = new Date(),
  ): Promise<LeadFollowUpFields> {
    const ctx = await this.loadFunilContext(tenantId);
    const etapa = ctx.etapasBySlug.get(stage) ?? null;
    const prazo = this.prazoFieldsForEtapa(now, etapa);
    return {
      lastMovementAt: now,
      lastTriagemAt: now,
      prazoAdiado: false,
      ...prazo,
    };
  }

  async recordMovement(
    leadId: string,
    kind: 'triagem' | 'tarefa' | 'atividade' | 'edicao',
    now = new Date(),
  ) {
    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
      select: { tenantId: true, stage: true },
    });
    if (!lead) return;

    const ctx = await this.loadFunilContext(lead.tenantId);
    const etapa = ctx.etapasBySlug.get(lead.stage) ?? null;
    const prazo = this.prazoFieldsForEtapa(now, etapa);

    await this.prisma.lead.update({
      where: { id: leadId },
      data: {
        lastMovementAt: now,
        prazoAdiado: false,
        ...prazo,
        ...(kind === 'triagem' ? { lastTriagemAt: now } : {}),
        ...(kind === 'tarefa' ? { lastTarefaAt: now } : {}),
        ...(kind === 'atividade' ? { lastAtividadeAt: now } : {}),
      },
    });
  }

  /**
   * Registrar atividade/tarefa encerra follow-ups vencidos para o lead
   * sair do atraso por tarefa atrasada.
   */
  async concludeOverdueTarefas(
    tenantId: string,
    leadId: string,
    now = new Date(),
    exceptId?: string,
  ) {
    await this.prisma.agendamento.updateMany({
      where: {
        tenantId,
        leadId,
        ...(exceptId ? { id: { not: exceptId } } : {}),
        ...overdueTarefaWhere(now),
      },
      data: { status: AgendamentoStatus.concluido },
    });
  }

  async applyStageToLeads(
    tenantId: string,
    leadIds: string[],
    stage: string,
    extra?: { lastTriagemAt?: Date; lastAtividadeAt?: Date },
  ) {
    const ids = [...new Set(leadIds.filter(Boolean))];
    if (ids.length === 0) return;
    const timing = await this.stageChangeData(tenantId, stage);
    await this.prisma.lead.updateMany({
      where: { id: { in: ids }, tenantId, perdidoAt: null },
      data: { stage, ...timing, ...extra },
    });
  }

  async recalculateStagePrazos(tenantId: string, stageSlug: string) {
    const ctx = await this.loadFunilContext(tenantId);
    const etapa = ctx.etapasBySlug.get(stageSlug) ?? null;
    const leads = await this.prisma.lead.findMany({
      where: {
        tenantId,
        stage: stageSlug,
        perdidoAt: null,
        prazoAdiado: false,
      },
      select: {
        id: true,
        stageEnteredAt: true,
        lastTriagemAt: true,
        lastAtividadeAt: true,
        lastTarefaAt: true,
        lastMovementAt: true,
      },
    });

    await Promise.all(
      leads.map((lead) => {
        const prazo = this.prazoFieldsForEtapa(
          this.slaAnchor(
            lead.stageEnteredAt,
            lead.lastTriagemAt,
            lead.lastAtividadeAt,
            lead.lastTarefaAt,
            lead.lastMovementAt,
          ),
          etapa,
        );
        return this.prisma.lead.update({
          where: { id: lead.id },
          data: {
            prazoDueAt: prazo.prazoDueAt,
            alertaProximoAt: prazo.alertaProximoAt,
          },
        });
      }),
    );
  }

  monitoramentoWhere(
    filtro: MonitoramentoFiltro | undefined,
    now: Date,
    ctx: FunilCtx,
  ): Prisma.LeadWhereInput | null {
    if (!filtro || filtro === 'todos') return null;
    const idleBefore = new Date(now.getTime() - ctx.inatividadeMs);
    const notTerminal: Prisma.LeadWhereInput =
      ctx.terminalSlugs.length > 0
        ? { stage: { notIn: ctx.terminalSlugs } }
        : {};

    if (filtro === 'sem_movimentacao') {
      return { lastMovementAt: { lt: idleBefore }, ...notTerminal };
    }
    if (filtro === 'em_atraso') {
      return {
        ...notTerminal,
        OR: [
          { prazoDueAt: { lt: now } },
          { agendamentos: { some: overdueTarefaWhere(now) } },
        ],
      };
    }
    if (filtro === 'proximo_vencimento') {
      return {
        alertaProximoAt: { lte: now },
        prazoDueAt: { gte: now },
        ...notTerminal,
      };
    }
    return {
      prazoDueAt: { gt: now },
      AND: [
        {
          OR: [{ alertaProximoAt: null }, { alertaProximoAt: { gt: now } }],
        },
      ],
      ...notTerminal,
    };
  }

  decorateLead<T extends LeadTimingRow>(
    lead: T,
    ctx: FunilCtx,
    requester: AuthenticatedUser,
    now = new Date(),
  ): T & { monitoramento: LeadMonitoramento } {
    return {
      ...lead,
      monitoramento: this.compute(lead, ctx, requester, now),
    };
  }

  decorateLeads<T extends LeadTimingRow>(
    leads: T[],
    ctx: FunilCtx,
    requester: AuthenticatedUser,
    now = new Date(),
  ): Array<T & { monitoramento: LeadMonitoramento }> {
    return leads.map((lead) => this.decorateLead(lead, ctx, requester, now));
  }

  async decorateLeadsWithTarefas<T extends LeadTimingRow>(
    leads: T[],
    ctx: FunilCtx,
    requester: AuthenticatedUser,
    now = new Date(),
  ): Promise<Array<T & { monitoramento: LeadMonitoramento }>> {
    const decorated = this.decorateLeads(leads, ctx, requester, now);
    if (decorated.length === 0) return decorated;
    const byLead = await this.loadOverdueTarefas(
      requireTenantId(requester),
      decorated.map((lead) => lead.id),
      now,
    );
    return decorated.map((lead) =>
      this.mergeTarefasAtrasadas(lead, byLead.get(lead.id) ?? []),
    );
  }

  async decorateLeadWithTarefas<T extends LeadTimingRow>(
    lead: T,
    ctx: FunilCtx,
    requester: AuthenticatedUser,
    now = new Date(),
  ): Promise<T & { monitoramento: LeadMonitoramento }> {
    const [row] = await this.decorateLeadsWithTarefas(
      [lead],
      ctx,
      requester,
      now,
    );
    return row;
  }

  async adiarPrazo(
    leadId: string,
    dto: AdiarPrazoDto,
    requester: AuthenticatedUser,
  ) {
    if (requester.role !== Role.admin && requester.role !== Role.gerente) {
      throw new ForbiddenException(
        'Apenas administradores e gerentes podem adiar o prazo da etapa.',
      );
    }

    const tenantId = requireTenantId(requester);
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, tenantId, perdidoAt: null },
      select: {
        id: true,
        nome: true,
        stage: true,
        corretorId: true,
        equipeId: true,
        stageEnteredAt: true,
        prazoDueAt: true,
        prazoAdiado: true,
      },
    });
    if (!lead) throw new NotFoundException('Lead não encontrado.');

    const allowed = await this.teamScope.canAccessCorretor(
      requester,
      lead.corretorId,
      lead.equipeId,
    );
    if (!allowed) throw new NotFoundException('Lead não encontrado.');

    const ctx = await this.loadFunilContext(tenantId);
    const etapa = ctx.etapasBySlug.get(lead.stage) ?? null;
    if (!etapa || isEtapaTerminal(etapa.papel)) {
      throw new BadRequestException(
        'Esta etapa não possui prazo de permanência.',
      );
    }

    const enteredAt = lead.stageEnteredAt;
    const novoDue = addPrazo(enteredAt, dto.valor, dto.unidade);
    if (novoDue.getTime() <= Date.now()) {
      throw new BadRequestException(
        'O novo prazo precisa ficar no futuro em relação à data de entrada na etapa.',
      );
    }

    const anteriorValor = etapa.prazoValor;
    const anteriorUnidade = etapa.prazoUnidade;
    const anteriorLabel =
      lead.prazoDueAt && anteriorValor
        ? formatPrazoCurto(anteriorValor, anteriorUnidade)
        : lead.prazoDueAt
          ? formatDurationPt(lead.prazoDueAt.getTime() - enteredAt.getTime())
          : 'sem prazo';
    const novoLabel = formatPrazoCurto(dto.valor, dto.unidade);
    const motivo = dto.motivo?.trim() || null;
    const texto = `Prazo da etapa adiado de ${anteriorLabel} para ${novoLabel} por ${requester.name}.${
      motivo ? ` Motivo: ${motivo}` : ''
    }`;

    const alertaAt = alertaProximoAt(
      enteredAt,
      novoDue,
      etapa.alertaAntecedenciaPercent || DEFAULT_ALERTA_PERCENT,
    );

    await this.prisma.$transaction([
      this.prisma.lead.update({
        where: { id: lead.id },
        data: {
          prazoDueAt: novoDue,
          alertaProximoAt: alertaAt,
          prazoAdiado: true,
          lastMovementAt: new Date(),
          lastTriagemAt: new Date(),
        },
      }),
      this.prisma.leadPrazoAdiamento.create({
        data: {
          tenantId,
          leadId: lead.id,
          autorId: requester.id,
          prazoAnteriorAt: lead.prazoDueAt,
          prazoNovoAt: novoDue,
          prazoAnteriorValor: anteriorValor,
          prazoAnteriorUnidade: anteriorValor ? anteriorUnidade : null,
          prazoNovoValor: dto.valor,
          prazoNovoUnidade: dto.unidade,
          motivo,
        },
      }),
      this.prisma.triagemEvent.create({
        data: {
          leadId: lead.id,
          autorId: requester.id,
          texto,
          stageAnterior: lead.stage,
          stageNovo: lead.stage,
          origem: TriagemOrigem.manual,
        },
      }),
    ]);

    const updated = await this.prisma.lead.findFirstOrThrow({
      where: { id: lead.id },
      select: {
        id: true,
        nome: true,
        stage: true,
        corretorId: true,
        equipeId: true,
        createdAt: true,
        ...leadTimingSelect,
        corretor: { select: { id: true, name: true } },
      },
    });

    return this.decorateLeadWithTarefas(updated, ctx, requester);
  }

  async listAdiamentos(
    leadId: string,
    requester: AuthenticatedUser,
  ): Promise<LeadPrazoAdiamentoView[]> {
    const tenantId = requireTenantId(requester);
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, tenantId },
      select: { id: true, corretorId: true, equipeId: true },
    });
    if (!lead) throw new NotFoundException('Lead não encontrado.');
    const allowed = await this.teamScope.canAccessCorretor(
      requester,
      lead.corretorId,
      lead.equipeId,
    );
    if (!allowed) throw new NotFoundException('Lead não encontrado.');

    const rows = await this.prisma.leadPrazoAdiamento.findMany({
      where: { leadId, tenantId },
      select: {
        id: true,
        motivo: true,
        createdAt: true,
        prazoAnteriorValor: true,
        prazoAnteriorUnidade: true,
        prazoNovoValor: true,
        prazoNovoUnidade: true,
        autor: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });

    return rows.map((row) => ({
      id: row.id,
      autorNome: row.autor.name,
      prazoAnteriorLabel:
        row.prazoAnteriorValor && row.prazoAnteriorUnidade
          ? formatPrazoCurto(row.prazoAnteriorValor, row.prazoAnteriorUnidade)
          : 'sem prazo',
      prazoNovoLabel: formatPrazoCurto(row.prazoNovoValor, row.prazoNovoUnidade),
      motivo: row.motivo,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async listCorretores(
    requester: AuthenticatedUser,
  ): Promise<CorretorMonitoramento[]> {
    if (
      requester.role !== Role.admin &&
      requester.role !== Role.gerente &&
      requester.role !== Role.analista &&
      !hasUserModule(requester.role, requester.permissions, 'atrasos')
    ) {
      throw new ForbiddenException(
        'Sem permissão para visualizar corretores em atraso.',
      );
    }

    const tenantId = requireTenantId(requester);
    const ctx = await this.loadFunilContext(tenantId);
    const leadScope = await this.teamScope.leadScope(requester, {
      includeAdminPool: false,
    });
    const now = new Date();
    const idleBefore = new Date(now.getTime() - ctx.inatividadeMs);

    const leads = await this.prisma.lead.findMany({
      where: {
        ...leadScope,
        perdidoAt: null,
        corretorId: { not: null },
        ...(ctx.terminalSlugs.length > 0
          ? { stage: { notIn: ctx.terminalSlugs } }
          : {}),
        OR: [
          { lastMovementAt: { lt: idleBefore } },
          { prazoDueAt: { lt: now } },
          { agendamentos: { some: overdueTarefaWhere(now) } },
        ],
      },
      select: {
        id: true,
        nome: true,
        stage: true,
        corretorId: true,
        equipeId: true,
        createdAt: true,
        ...leadTimingSelect,
        corretor: { select: { id: true, name: true } },
      },
      take: 2000,
    });

    const byCorretor = new Map<string, CorretorMonitoramento>();
    const decorated = await this.decorateLeadsWithTarefas(
      leads,
      ctx,
      requester,
      now,
    );
    for (const lead of decorated) {
      if (!lead.corretorId || !lead.corretor) continue;
      const mon = lead.monitoramento;
      if (mon.visual !== 'vermelho') continue;
      const overdue = mon.problemas.some((p) => p.tipo === 'prazo_ultrapassado');
      const idle = mon.problemas.some((p) => p.tipo === 'sem_movimentacao');
      const tarefas = mon.tarefasAtrasadas.length;
      let row = byCorretor.get(lead.corretorId);
      if (!row) {
        row = {
          id: lead.corretor.id,
          name: lead.corretor.name,
          totalAtrasos: 0,
          semMovimentacao: 0,
          foraDoPrazo: 0,
          tarefasAtrasadas: 0,
          leads: [],
        };
        byCorretor.set(lead.corretorId, row);
      }
      row.totalAtrasos += 1;
      if (idle) row.semMovimentacao += 1;
      if (overdue) row.foraDoPrazo += 1;
      row.tarefasAtrasadas += tarefas;
      row.leads.push({
        id: lead.id,
        nome: lead.nome,
        stage: lead.stage,
        problemas: mon.problemas,
        tarefasAtrasadas: mon.tarefasAtrasadas,
      });
    }

    return [...byCorretor.values()].sort(
      (a, b) => b.totalAtrasos - a.totalAtrasos || a.name.localeCompare(b.name),
    );
  }

  /**
   * Dispara notificações pendentes no escopo do usuário.
   * Idempotente — o frontend chama no mesmo polling do sino.
   */
  async syncNotificacoes(requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);
    const ctx = await this.loadFunilContext(tenantId);
    await this.backfillPrazoCache(tenantId, ctx);
    const leadScope = await this.teamScope.leadScope(requester, {
      includeAdminPool: false,
    });
    const now = new Date();

    const leads = await this.prisma.lead.findMany({
      where: {
        ...leadScope,
        perdidoAt: null,
        ...(ctx.terminalSlugs.length > 0
          ? { stage: { notIn: ctx.terminalSlugs } }
          : {}),
        OR: [
          { prazoDueAt: { lte: now } },
          {
            alertaProximoAt: { lte: now },
            prazoDueAt: { gt: now },
          },
        ],
      },
      select: {
        id: true,
        nome: true,
        stage: true,
        corretorId: true,
        equipeId: true,
        createdAt: true,
        ...leadTimingSelect,
        corretor: { select: { id: true, name: true } },
      },
      take: 200,
    });

    let created = 0;
    for (const lead of leads) {
      const mon = this.compute(lead, ctx, requester, now);
      const dueAt = mon.prazoDueAt ? new Date(mon.prazoDueAt) : null;
      const enteredAt = new Date(mon.stageEnteredAt ?? lead.createdAt);
      if (!dueAt) continue;
      const chave = fingerprintPrazo(enteredAt, dueAt);

      const overdue = mon.problemas.some((p) => p.tipo === 'prazo_ultrapassado');
      const near = mon.problemas.some((p) => p.tipo === 'prazo_proximo');

      if (near && !overdue) {
        if (lead.corretorId) {
          const n = await this.notificacoes.createLeadPrazoAlerta({
            userId: lead.corretorId,
            leadId: lead.id,
            leadNome: lead.nome,
            eventoChave: chave,
            tipo: NotificacaoTipo.lead_prazo_proximo,
            detalhe: `O lead ${lead.nome} está próximo de ultrapassar o prazo da etapa (${mon.tempoRestanteLabel ?? 'pouco tempo restante'}).`,
          });
          if (n) created += 1;
        }
        continue;
      }

      if (!overdue) continue;

      const recipients = await this.resolveOverdueRecipients(tenantId, lead);
      const detalhe = `O lead ${lead.nome} ultrapassou o prazo da etapa (${mon.tempoAtrasoLabel ?? 'atrasado'}).`;
      for (const userId of recipients) {
        const n = await this.notificacoes.createLeadPrazoAlerta({
          userId,
          leadId: lead.id,
          leadNome: lead.nome,
          eventoChave: chave,
          tipo: NotificacaoTipo.lead_prazo_ultrapassado,
          detalhe,
        });
        if (n) created += 1;
      }
    }

    created += await this.syncTarefasAtrasadas(tenantId, ctx, requester, now);
    created += await this.syncLeadsSemAtendimento(
      tenantId,
      ctx,
      requester,
      now,
    );
    created += await this.syncPropostasVencimento(tenantId, requester, now);

    return { ok: true, created };
  }

  /** Leads sem movimentação além do limiar de inatividade do funil. */
  private async syncLeadsSemAtendimento(
    tenantId: string,
    ctx: FunilCtx,
    requester: AuthenticatedUser,
    now: Date,
  ): Promise<number> {
    const leadScope = await this.teamScope.leadScope(requester, {
      includeAdminPool: false,
    });
    const idleSince = new Date(now.getTime() - ctx.inatividadeMs);

    const leads = await this.prisma.lead.findMany({
      where: {
        ...leadScope,
        perdidoAt: null,
        lastMovementAt: { lte: idleSince },
        ...(ctx.terminalSlugs.length > 0
          ? { stage: { notIn: ctx.terminalSlugs } }
          : {}),
      },
      select: {
        id: true,
        nome: true,
        stage: true,
        corretorId: true,
        equipeId: true,
        createdAt: true,
        ...leadTimingSelect,
        corretor: { select: { id: true, name: true } },
      },
      take: 200,
    });

    let created = 0;
    for (const lead of leads) {
      const mon = this.compute(lead, ctx, requester, now);
      const idle = mon.problemas.find((p) => p.tipo === 'sem_movimentacao');
      if (!idle) continue;

      const lastMovement = lead.lastMovementAt ?? lead.createdAt;
      const chave = lastMovement.toISOString();
      const motivos =
        idle.motivos?.map((m) => MOTIVO_LABEL[m]).filter(Boolean) ?? [];
      const detalhe =
        motivos.length > 0
          ? `${idle.detalhe} Motivos: ${motivos.join(', ')}.`
          : idle.detalhe;

      const recipients = await this.resolveOverdueRecipients(tenantId, lead);
      for (const userId of recipients) {
        const n = await this.notificacoes.createLeadSemAtendimento({
          userId,
          leadId: lead.id,
          leadNome: lead.nome,
          eventoChave: chave,
          detalhe,
        });
        if (n) created += 1;
      }
    }
    return created;
  }

  /** Propostas enviadas/em negociação com validade nos próximos 3 dias. */
  private async syncPropostasVencimento(
    tenantId: string,
    requester: AuthenticatedUser,
    now: Date,
  ): Promise<number> {
    const horizon = new Date(now.getTime() + PROPOSTA_ALERTA_ANTECEDENCIA_MS);

    const scopeOr: Prisma.PropostaWhereInput[] = [];
    if (requester.role === Role.admin) {
      // admin: todas do tenant
    } else if (requester.role === Role.gerente) {
      const corretorIds = await this.teamScope.getVisibleCorretorIds(requester);
      const ids = [...(corretorIds ?? []), requester.id];
      scopeOr.push(
        { corretorId: { in: ids } },
        { autorId: { in: ids } },
      );
    } else {
      scopeOr.push(
        { corretorId: requester.id },
        { autorId: requester.id },
      );
    }

    const propostas = await this.prisma.proposta.findMany({
      where: {
        tenantId,
        validade: { gte: now, lte: horizon },
        status: {
          in: [PropostaStatus.enviada, PropostaStatus.negociacao],
        },
        ...(scopeOr.length > 0 ? { OR: scopeOr } : {}),
      },
      select: {
        id: true,
        codigo: true,
        clienteNome: true,
        validade: true,
        corretorId: true,
        autorId: true,
        leadId: true,
        lead: {
          select: { corretorId: true, equipeId: true },
        },
      },
      take: 100,
    });

    let created = 0;
    for (const proposta of propostas) {
      if (!proposta.validade) continue;
      const chave = proposta.validade.toISOString();
      const validadeLabel = proposta.validade.toLocaleString('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
      });

      const recipientIds = new Set<string>();
      if (proposta.corretorId) recipientIds.add(proposta.corretorId);
      if (proposta.autorId) recipientIds.add(proposta.autorId);

      const teamLead = {
        corretorId: proposta.corretorId ?? proposta.lead?.corretorId ?? null,
        equipeId: proposta.lead?.equipeId ?? null,
      };
      for (const id of await this.resolveOverdueRecipients(tenantId, teamLead)) {
        recipientIds.add(id);
      }

      for (const userId of recipientIds) {
        const n = await this.notificacoes.createPropostaVencimentoProximo({
          userId,
          propostaId: proposta.id,
          codigo: proposta.codigo,
          clienteNome: proposta.clienteNome,
          validadeLabel,
          leadId: proposta.leadId,
          eventoChave: chave,
        });
        if (n) created += 1;
      }
    }
    return created;
  }

  /** Completa prazoDueAt de leads cuja etapa passou a ter SLA (lote pequeno por polling). */
  private async backfillPrazoCache(tenantId: string, ctx: FunilCtx) {
    const slugs = [...ctx.etapasBySlug.values()]
      .filter((e) => e.prazoValor && !isEtapaTerminal(e.papel))
      .map((e) => e.slug);
    if (slugs.length === 0) return;

    const missing = await this.prisma.lead.findMany({
      where: {
        tenantId,
        perdidoAt: null,
        prazoAdiado: false,
        prazoDueAt: null,
        stage: { in: slugs },
      },
      select: {
        id: true,
        stage: true,
        stageEnteredAt: true,
        lastTriagemAt: true,
      },
      take: 80,
    });
    for (const lead of missing) {
      const etapa = ctx.etapasBySlug.get(lead.stage) ?? null;
      const prazo = this.prazoFieldsForEtapa(
        this.slaAnchor(lead.stageEnteredAt, lead.lastTriagemAt),
        etapa,
      );
      if (!prazo.prazoDueAt) continue;
      await this.prisma.lead.update({
        where: { id: lead.id },
        data: {
          prazoDueAt: prazo.prazoDueAt,
          alertaProximoAt: prazo.alertaProximoAt,
        },
      });
    }
  }

  private async resolveOverdueRecipients(
    tenantId: string,
    lead: { corretorId: string | null; equipeId: string | null },
  ): Promise<string[]> {
    const ids = new Set<string>();
    if (lead.corretorId) ids.add(lead.corretorId);

    const corretor = lead.corretorId
      ? await this.prisma.user.findFirst({
          where: { id: lead.corretorId, tenantId },
          select: { equipeId: true },
        })
      : null;

    const equipeId = lead.equipeId ?? corretor?.equipeId ?? null;
    if (equipeId) {
      const equipe = await this.prisma.equipe.findFirst({
        where: { id: equipeId, tenantId },
        select: { gerenteId: true },
      });
      if (equipe?.gerenteId) ids.add(equipe.gerenteId);
    }

    const admins = await this.prisma.user.findMany({
      where: { tenantId, role: Role.admin, status: UserStatus.ativo },
      select: { id: true },
    });
    for (const admin of admins) ids.add(admin.id);

    const active = await this.prisma.user.findMany({
      where: {
        id: { in: [...ids] },
        tenantId,
        status: UserStatus.ativo,
      },
      select: { id: true },
    });
    return active.map((u) => u.id);
  }

  private async loadOverdueTarefas(
    tenantId: string,
    leadIds: string[],
    now: Date,
  ): Promise<Map<string, TarefaAtrasadaResumo[]>> {
    const map = new Map<string, TarefaAtrasadaResumo[]>();
    if (leadIds.length === 0) return map;
    const rows = await this.prisma.agendamento.findMany({
      where: {
        tenantId,
        leadId: { in: leadIds },
        ...overdueTarefaWhere(now),
      },
      select: {
        id: true,
        leadId: true,
        titulo: true,
        startsAt: true,
        endsAt: true,
        funilStage: true,
      },
      orderBy: { startsAt: 'asc' },
    });
    for (const row of rows) {
      if (!row.leadId) continue;
      const list = map.get(row.leadId) ?? [];
      list.push({
        id: row.id,
        titulo: row.titulo,
        prazo: formatTarefaPrazo(row.startsAt, row.endsAt),
        funilStage: row.funilStage,
      });
      map.set(row.leadId, list);
    }
    return map;
  }

  private mergeTarefasAtrasadas<T extends { monitoramento: LeadMonitoramento }>(
    lead: T,
    tasks: TarefaAtrasadaResumo[],
  ): T {
    if (tasks.length === 0) return lead;
    const first = tasks[0];
    const detalhe =
      tasks.length === 1
        ? `"${first.titulo}" venceu em ${first.prazo}.`
        : `${tasks.length} tarefas atrasadas. A mais antiga: "${first.titulo}" (${first.prazo}).`;
    const problemas = [
      ...lead.monitoramento.problemas.filter(
        (p) => p.tipo !== 'tarefa_atrasada',
      ),
      {
        tipo: 'tarefa_atrasada' as const,
        titulo: 'Tarefa atrasada',
        detalhe,
      },
    ];
    return {
      ...lead,
      monitoramento: {
        ...lead.monitoramento,
        problemas,
        nivel: 'atrasado',
        visual: 'vermelho',
        tarefasAtrasadas: tasks,
      },
    };
  }

  private async syncTarefasAtrasadas(
    tenantId: string,
    ctx: FunilCtx,
    requester: AuthenticatedUser,
    now: Date,
  ): Promise<number> {
    const leadScope = await this.teamScope.leadScope(requester, {
      includeAdminPool: false,
    });
    const tasks = await this.prisma.agendamento.findMany({
      where: {
        tenantId,
        leadId: { not: null },
        ...overdueTarefaWhere(now),
        lead: {
          is: {
            ...leadScope,
            perdidoAt: null,
            ...(ctx.terminalSlugs.length > 0
              ? { stage: { notIn: ctx.terminalSlugs } }
              : {}),
          },
        },
      },
      select: {
        id: true,
        titulo: true,
        startsAt: true,
        endsAt: true,
        leadId: true,
        autorId: true,
        atribuidoParaId: true,
        lead: {
          select: {
            id: true,
            nome: true,
            corretorId: true,
            equipeId: true,
          },
        },
      },
      take: 200,
    });

    let created = 0;
    for (const task of tasks) {
      if (!task.lead) continue;
      const recipients = new Set(
        await this.resolveOverdueRecipients(tenantId, task.lead),
      );
      if (task.atribuidoParaId) recipients.add(task.atribuidoParaId);
      if (task.autorId) recipients.add(task.autorId);
      const prazoLabel = formatTarefaPrazo(task.startsAt, task.endsAt);
      for (const userId of recipients) {
        const n = await this.notificacoes.createTarefaAtrasada({
          userId,
          leadId: task.lead.id,
          agendamentoId: task.id,
          leadNome: task.lead.nome,
          titulo: task.titulo,
          prazoLabel,
        });
        if (n) created += 1;
      }
    }
    return created;
  }

  private slaAnchor(
    enteredAt: Date,
    lastTriagemAt: Date | null,
    lastAtividadeAt: Date | null = null,
    lastTarefaAt: Date | null = null,
    lastMovementAt: Date | null = null,
  ): Date {
    let latest = enteredAt;
    for (const d of [
      lastTriagemAt,
      lastAtividadeAt,
      lastTarefaAt,
      lastMovementAt,
    ]) {
      if (d && d.getTime() > latest.getTime()) latest = d;
    }
    return latest;
  }

  private prazoFieldsForEtapa(
    enteredAt: Date,
    etapa: EtapaCtx | null,
  ): { prazoDueAt: Date | null; alertaProximoAt: Date | null } {
    if (
      !etapa ||
      isEtapaTerminal(etapa.papel) ||
      !etapa.prazoValor ||
      etapa.prazoValor <= 0
    ) {
      return { prazoDueAt: null, alertaProximoAt: null };
    }
    const due = addPrazo(enteredAt, etapa.prazoValor, etapa.prazoUnidade);
    return {
      prazoDueAt: due,
      alertaProximoAt: alertaProximoAt(
        enteredAt,
        due,
        etapa.alertaAntecedenciaPercent || DEFAULT_ALERTA_PERCENT,
      ),
    };
  }

  private compute(
    lead: LeadTimingRow,
    ctx: FunilCtx,
    requester: AuthenticatedUser,
    now: Date,
  ): LeadMonitoramento {
    const etapa = ctx.etapasBySlug.get(lead.stage) ?? null;
    const terminal = isEtapaTerminal(etapa?.papel);
    const enteredAt = lead.stageEnteredAt ?? lead.createdAt;
    const lastMovementAt = lead.lastMovementAt ?? lead.createdAt;
    const slaStart = this.slaAnchor(
      enteredAt,
      lead.lastTriagemAt,
      lead.lastAtividadeAt,
      lead.lastTarefaAt,
      lastMovementAt,
    );
    const computed = this.prazoFieldsForEtapa(slaStart, etapa);
    const computedDue = computed.prazoDueAt ?? lead.prazoDueAt;
    const adiadoDue =
      lead.prazoAdiado && lead.prazoDueAt ? lead.prazoDueAt : null;
    const dueAt =
      adiadoDue &&
      computedDue &&
      adiadoDue.getTime() > computedDue.getTime()
        ? adiadoDue
        : computedDue;
    const nearAt =
      dueAt === adiadoDue
        ? (lead.alertaProximoAt ?? computed.alertaProximoAt)
        : (computed.alertaProximoAt ?? lead.alertaProximoAt);

    const permanenciaMs = Math.max(0, now.getTime() - enteredAt.getTime());
    const idleMs = Math.max(0, now.getTime() - lastMovementAt.getTime());
    const problemas: ProblemaMonitoramento[] = [];

    if (!terminal && dueAt && dueAt.getTime() < now.getTime()) {
      const atraso = now.getTime() - dueAt.getTime();
      problemas.push({
        tipo: 'prazo_ultrapassado',
        titulo: 'Prazo da etapa ultrapassado',
        detalhe: `Atrasado há ${formatDurationPt(atraso)}.`,
      });
    }

    if (!terminal && ctx.inatividadeMs > 0 && idleMs >= ctx.inatividadeMs) {
      const motivos = this.motivosSemMovimentacao(lead, now, ctx.inatividadeMs);
      problemas.push({
        tipo: 'sem_movimentacao',
        titulo: 'Lead sem movimentação',
        detalhe: `Sem movimentação há ${formatDurationPt(idleMs)}.`,
        motivos,
      });
    }

    if (
      !terminal &&
      dueAt &&
      dueAt.getTime() >= now.getTime() &&
      nearAt &&
      nearAt.getTime() <= now.getTime()
    ) {
      const restante = dueAt.getTime() - now.getTime();
      problemas.push({
        tipo: 'prazo_proximo',
        titulo: 'Prazo próximo do vencimento',
        detalhe: `Restam ${formatDurationPt(restante)} para o prazo da etapa.`,
      });
    }

    const hasOverdue = problemas.some((p) => p.tipo === 'prazo_ultrapassado');
    const hasIdle = problemas.some((p) => p.tipo === 'sem_movimentacao');
    const hasNear = problemas.some((p) => p.tipo === 'prazo_proximo');

    let nivel: LeadMonitoramento['nivel'] = 'normal';
    let visual: LeadMonitoramento['visual'] = 'none';
    if (hasOverdue) {
      nivel = 'atrasado';
      visual = 'vermelho';
    } else if (hasIdle) {
      nivel = 'sem_movimentacao';
      visual = 'vermelho';
    } else if (hasNear) {
      nivel = 'proximo';
      visual = 'laranja';
    }

    const tempoAtrasoMs =
      dueAt && dueAt.getTime() < now.getTime()
        ? now.getTime() - dueAt.getTime()
        : null;
    const tempoRestanteMs =
      dueAt && dueAt.getTime() >= now.getTime()
        ? dueAt.getTime() - now.getTime()
        : null;

    const canAdiar =
      (requester.role === Role.admin || requester.role === Role.gerente) &&
      !terminal &&
      !!dueAt;

    return {
      nivel,
      visual,
      problemas,
      stageEnteredAt: enteredAt.toISOString(),
      prazoDueAt: dueAt ? dueAt.toISOString() : null,
      prazoConfigurado:
        etapa?.prazoValor && !isEtapaTerminal(etapa.papel)
          ? { valor: etapa.prazoValor, unidade: etapa.prazoUnidade }
          : null,
      prazoAdiado: lead.prazoAdiado,
      lastMovementAt: lastMovementAt.toISOString(),
      lastStageChangeAt: lead.lastStageChangeAt?.toISOString() ?? null,
      lastTriagemAt: lead.lastTriagemAt?.toISOString() ?? null,
      lastTarefaAt: lead.lastTarefaAt?.toISOString() ?? null,
      lastAtividadeAt: lead.lastAtividadeAt?.toISOString() ?? null,
      permanenciaMs,
      permanenciaLabel: formatDurationPt(permanenciaMs),
      tempoRestanteMs,
      tempoRestanteLabel: tempoRestanteMs
        ? formatDurationPt(tempoRestanteMs)
        : null,
      tempoAtrasoMs,
      tempoAtrasoLabel: tempoAtrasoMs ? formatDurationPt(tempoAtrasoMs) : null,
      tempoSemMovimentacaoMs: idleMs,
      tempoSemMovimentacaoLabel: formatDurationPt(idleMs),
      inatividadeThresholdMs: ctx.inatividadeMs,
      inatividadeConfig: {
        valor: ctx.inatividadeValor,
        unidade: ctx.inatividadeUnidade,
      },
      podeAdiar: canAdiar,
      tarefasAtrasadas: [],
    };
  }

  private motivosSemMovimentacao(
    lead: LeadTimingRow,
    now: Date,
    thresholdMs: number,
  ): MotivoSemMovimentacao[] {
    const cutoff = new Date(now.getTime() - thresholdMs);
    const stale = (d: Date | null) => !d || d.getTime() < cutoff.getTime();
    const motivos: MotivoSemMovimentacao[] = [];
    if (stale(lead.lastStageChangeAt)) motivos.push('sem_status');
    if (stale(lead.lastTriagemAt)) motivos.push('sem_triagem');
    if (stale(lead.lastAtividadeAt)) motivos.push('sem_atividade');
    if (stale(lead.lastTarefaAt)) motivos.push('sem_tarefa');
    return motivos;
  }
}
