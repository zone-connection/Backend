import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ContatoTipo, FunilEtapaPapel, TriagemOrigem } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CatalogService } from '../catalog/catalog.service';
import { TeamScopeService } from '../equipes/team-scope.service';
import { AnaliseService } from '../analise/analise.service';
import { FunisService } from '../funis/funis.service';
import { LeadMonitoramentoService } from '../leads/monitoramento/lead-monitoramento.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { requireTenantId } from '../common/utils/tenant';
import { isCorretorLike, canWriteTriagem } from '../common/utils/roles';
import { CreateTriagemDto } from './dto/create-triagem.dto';
import { UpdateTriagemDto } from './dto/update-triagem.dto';
import { QueryTriagemLeadsDto } from './dto/query-triagem-leads.dto';
import { QueryTriagemKpisDto } from './dto/query-triagem-kpis.dto';

const leadListSelect = {
  id: true,
  tipo: true,
  nome: true,
  telefone: true,
  email: true,
  stage: true,
  prioridade: true,
  interesse: true,
  cidade: true,
  bairro: true,
  corretorId: true,
  corretor: { select: { id: true, name: true } },
  origemAtrasoLiberacao: true,
  triagemOrigemHerdada: true,
  updatedAt: true,
} as const;

const eventSelect = {
  id: true,
  leadId: true,
  texto: true,
  textoAnterior: true,
  stageAnterior: true,
  stageNovo: true,
  origem: true,
  createdAt: true,
  editedAt: true,
  autor: { select: { id: true, name: true } },
} as const;

@Injectable()
export class TriagemService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
    private readonly teamScope: TeamScopeService,
    private readonly analiseService: AnaliseService,
    private readonly funis: FunisService,
    private readonly monitoramento: LeadMonitoramentoService,
  ) {}

  /**
   * Lista contatos para a tela de triagem.
   * Corretor: próprios leads + clientes.
   * Admin/gerente: só leads (`tipo=lead`) do `corretorId` obrigatório (dentro da equipe).
   */
  async listLeads(query: QueryTriagemLeadsDto, requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);

    if (isCorretorLike(requester.role)) {
      const contacts = await this.prisma.lead.findMany({
        where: {
          tenantId,
          corretorId: requester.id,
          perdidoAt: null,
        },
        select: leadListSelect,
        orderBy: { updatedAt: 'desc' },
      });

      return {
        leads: contacts.filter((c) => c.tipo === ContatoTipo.lead),
        clientes: contacts.filter((c) => c.tipo === ContatoTipo.cliente),
      };
    }

    if (!query.corretorId) {
      throw new BadRequestException(
        'Informe o corretor para listar os leads da triagem.',
      );
    }

    const allowed = await this.teamScope.canAccessCorretor(
      requester,
      query.corretorId,
    );
    if (!allowed) {
      throw new NotFoundException('Lead não encontrado.');
    }

    const leads = await this.prisma.lead.findMany({
      where: {
        tenantId,
        corretorId: query.corretorId,
        tipo: ContatoTipo.lead,
        perdidoAt: null,
      },
      select: leadListSelect,
      orderBy: { updatedAt: 'desc' },
    });

    return { leads, clientes: [] as typeof leads };
  }

  /** Histórico de relatos de um lead (RBAC por dono). */
  async listByLead(leadId: string, requester: AuthenticatedUser) {
    const lead = await this.ensureLeadAccessible(leadId, requester);

    const events = await this.prisma.triagemEvent.findMany({
      where: { leadId },
      select: eventSelect,
      orderBy: { createdAt: 'desc' },
    });

    return {
      lead: {
        id: lead.id,
        tipo: lead.tipo,
        nome: lead.nome,
        stage: lead.stage,
        corretorId: lead.corretorId,
        corretor: lead.corretor,
        origemAtrasoLiberacao: lead.origemAtrasoLiberacao,
        triagemOrigemHerdada: lead.triagemOrigemHerdada,
      },
      events,
    };
  }

  /**
   * Treinee, corretor, gerente e admin criam relatos; opcionalmente avançam a etapa.
   * Corretor/treinee: só da própria carteira. Gerente/admin: leads e clientes no escopo.
   */
  async create(dto: CreateTriagemDto, requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);

    if (!canWriteTriagem(requester.role)) {
      throw new ForbiddenException(
        'Apenas treinee, corretor, gerente e administrador podem registrar relatos na triagem.',
      );
    }

    const lead = await this.prisma.lead.findFirst({
      where: { id: dto.leadId, tenantId },
      select: {
        id: true,
        corretorId: true,
        equipeId: true,
        origemAtrasoLiberacao: true,
        perdidoAt: true,
        stage: true,
      },
    });

    if (!lead || lead.perdidoAt) {
      throw new NotFoundException('Lead não encontrado.');
    }

    if (isCorretorLike(requester.role)) {
      if (lead.corretorId !== requester.id) {
        throw new NotFoundException('Lead não encontrado.');
      }
    } else {
      const allowed = await this.teamScope.canAccessCorretor(
        requester,
        lead.corretorId,
        lead.equipeId,
        lead.origemAtrasoLiberacao,
      );
      if (!allowed) {
        throw new NotFoundException('Lead não encontrado.');
      }
    }

    const texto = dto.texto.trim();
    if (!texto) {
      throw new BadRequestException('Informe o relato.');
    }

    let stageAnterior: string | null = null;
    let stageNovo: string | null = null;
    let shouldUpdateStage = false;
    const targetStage = dto.stage?.trim();
    const origem =
      dto.origem === 'funil' ? TriagemOrigem.funil : TriagemOrigem.manual;

    if (targetStage) {
      await this.ensureStageIsValid(tenantId, targetStage);
      if (targetStage !== lead.stage) {
        stageAnterior = lead.stage;
        stageNovo = targetStage;
        shouldUpdateStage = true;
      } else if (origem === TriagemOrigem.funil) {
        // Funil já avançou a etapa; o relato consolida o único acontecimento.
        stageNovo = targetStage;
        const from = dto.stageAnterior?.trim();
        if (from && from !== targetStage) {
          stageAnterior = from;
        }
      } else {
        // Mesma etapa (manual): registra que a etapa foi mantida.
        stageNovo = targetStage;
      }
    } else {
      // Sem mudança de etapa: grava a etapa atual no histórico.
      stageNovo = lead.stage;
    }

    const now = new Date();
    const timing =
      shouldUpdateStage && targetStage
        ? await this.monitoramento.stageChangeData(tenantId, targetStage, now)
        : await this.monitoramento.followUpData(tenantId, lead.stage, now);

    const event = await this.prisma.$transaction(async (tx) => {
      await tx.lead.update({
        where: { id: lead.id },
        data: {
          ...(shouldUpdateStage && targetStage ? { stage: targetStage } : {}),
          ...timing,
          lastTriagemAt: now,
        },
      });

      return tx.triagemEvent.create({
        data: {
          leadId: lead.id,
          autorId: requester.id,
          texto,
          stageAnterior,
          stageNovo,
          origem,
        },
        select: eventSelect,
      });
    });

    if (targetStage) {
      const papel = await this.funis.getPapelBySlug(tenantId, targetStage);
      if (papel === FunilEtapaPapel.analise) {
        await this.analiseService.ensureForLead(
          lead.id,
          requester.id,
          tenantId,
        );
      }
    }

    return event;
  }

  /**
   * O autor edita o texto do próprio relato (treinee, corretor, gerente ou admin).
   * Guarda o texto anterior para consulta.
   */
  async update(
    id: string,
    dto: UpdateTriagemDto,
    requester: AuthenticatedUser,
  ) {
    requireTenantId(requester);

    if (!canWriteTriagem(requester.role)) {
      throw new ForbiddenException(
        'Apenas o autor pode editar o próprio relato.',
      );
    }

    const texto = dto.texto.trim();
    if (!texto) {
      throw new BadRequestException('Informe o relato.');
    }

    const existing = await this.prisma.triagemEvent.findFirst({
      where: { id, autorId: requester.id },
      select: {
        id: true,
        texto: true,
        lead: {
          select: { id: true, tenantId: true, perdidoAt: true, stage: true },
        },
      },
    });

    if (!existing || existing.lead.perdidoAt) {
      throw new NotFoundException('Relato não encontrado.');
    }

    if (existing.lead.tenantId !== requester.tenantId) {
      throw new NotFoundException('Relato não encontrado.');
    }

    if (texto === existing.texto) {
      return this.prisma.triagemEvent.findFirstOrThrow({
        where: { id },
        select: eventSelect,
      });
    }

    const now = new Date();
    const followUp = await this.monitoramento.followUpData(
      existing.lead.tenantId,
      existing.lead.stage,
      now,
    );

    const [, event] = await this.prisma.$transaction([
      this.prisma.lead.update({
        where: { id: existing.lead.id },
        data: followUp,
      }),
      this.prisma.triagemEvent.update({
        where: { id },
        data: {
          textoAnterior: existing.texto,
          texto,
          editedAt: now,
        },
        select: eventSelect,
      }),
    ]);

    return event;
  }

  /**
   * KPIs da tela: tempo médio até o próximo relato, atualizações no dia
   * e corretor com menor tempo médio no escopo.
   */
  async kpis(query: QueryTriagemKpisDto, requester: AuthenticatedUser) {
    const scope = await this.teamScope.leadScope(requester);
    const equipeWhere = query.semEquipe
      ? { equipeId: null }
      : query.equipeId
        ? { equipeId: query.equipeId }
        : {};

    const events = await this.prisma.triagemEvent.findMany({
      where: {
        lead: {
          AND: [
            scope,
            { tipo: ContatoTipo.lead, perdidoAt: null },
            equipeWhere,
          ],
        },
      },
      select: {
        leadId: true,
        createdAt: true,
        lead: {
          select: {
            createdAt: true,
            corretorId: true,
            corretor: { select: { name: true } },
          },
        },
      },
      orderBy: [{ leadId: 'asc' }, { createdAt: 'asc' }],
    });

    const { start: todayStart, end: todayEnd } = saoPauloDayBounds();
    const yesterdayStart = new Date(todayStart.getTime() - 86_400_000);

    const durations: { ms: number; corretorId: string | null; nome: string }[] =
      [];
    let prevLeadId: string | null = null;
    let prevAt: Date | null = null;

    for (const event of events) {
      const baseline =
        event.leadId === prevLeadId && prevAt
          ? prevAt
          : event.lead.createdAt;
      const ms = event.createdAt.getTime() - baseline.getTime();
      if (ms > 0) {
        durations.push({
          ms,
          corretorId: event.lead.corretorId,
          nome: event.lead.corretor?.name?.trim() || 'Sem corretor',
        });
      }
      prevLeadId = event.leadId;
      prevAt = event.createdAt;
    }

    const avgMs = durations.length
      ? Math.round(
          durations.reduce((sum, item) => sum + item.ms, 0) / durations.length,
        )
      : 0;

    const byCorretor = new Map<
      string,
      { nome: string; total: number; count: number }
    >();
    for (const item of durations) {
      const key = item.corretorId ?? '__none__';
      const current = byCorretor.get(key) ?? {
        nome: item.nome,
        total: 0,
        count: 0,
      };
      current.total += item.ms;
      current.count += 1;
      byCorretor.set(key, current);
    }

    let maisRapida: {
      corretorId: string | null;
      nome: string;
      tempoMedioMs: number;
    } | null = null;
    for (const [key, stats] of byCorretor) {
      const tempoMedioMs = Math.round(stats.total / stats.count);
      if (!maisRapida || tempoMedioMs < maisRapida.tempoMedioMs) {
        maisRapida = {
          corretorId: key === '__none__' ? null : key,
          nome: stats.nome,
          tempoMedioMs,
        };
      }
    }

    const atualizadosHoje = new Set(
      events
        .filter(
          (event) =>
            event.createdAt >= todayStart && event.createdAt < todayEnd,
        )
        .map((event) => event.leadId),
    ).size;
    const atualizadosOntem = new Set(
      events
        .filter(
          (event) =>
            event.createdAt >= yesterdayStart && event.createdAt < todayStart,
        )
        .map((event) => event.leadId),
    ).size;

    return {
      tempoMedioMs: avgMs,
      amostra: durations.length,
      atualizadosHoje,
      atualizadosOntem,
      maisRapida,
    };
  }

  private async ensureLeadAccessible(
    leadId: string,
    requester: AuthenticatedUser,
  ) {
    const tenantId = requireTenantId(requester);
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, tenantId },
      select: {
        id: true,
        tipo: true,
        nome: true,
        stage: true,
        corretorId: true,
        equipeId: true,
        origemAtrasoLiberacao: true,
        triagemOrigemHerdada: true,
        perdidoAt: true,
        corretor: { select: { id: true, name: true } },
      },
    });

    if (!lead || lead.perdidoAt) {
      throw new NotFoundException('Lead não encontrado.');
    }

    const allowed = await this.teamScope.canAccessCorretor(
      requester,
      lead.corretorId,
      lead.equipeId,
      lead.origemAtrasoLiberacao,
    );
    if (!allowed) {
      throw new NotFoundException('Lead não encontrado.');
    }

    return lead;
  }

  private async ensureStageIsValid(
    tenantId: string,
    stage: string,
  ): Promise<void> {
    const validStages = await this.catalog.getActiveStageSlugs(tenantId);
    if (validStages.length === 0) {
      throw new BadRequestException(
        'Nenhuma etapa do funil cadastrada. Configure as etapas em Configurações.',
      );
    }
    if (!validStages.includes(stage)) {
      throw new BadRequestException('Etapa do funil inválida.');
    }
  }
}

/** Meia-noite em America/Sao_Paulo (UTC-3 o ano inteiro). */
function saoPauloDayBounds(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const year = Number(parts.find((p) => p.type === 'year')?.value);
  const month = Number(parts.find((p) => p.type === 'month')?.value);
  const day = Number(parts.find((p) => p.type === 'day')?.value);
  const start = new Date(Date.UTC(year, month - 1, day, 3, 0, 0, 0));
  const end = new Date(start.getTime() + 86_400_000);
  return { start, end };
}
