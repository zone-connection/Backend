import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AnaliseStatus,
  FunilEtapaPapel,
  Prisma,
  Role,
  TriagemOrigem,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TeamScopeService } from '../equipes/team-scope.service';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { FunisService } from '../funis/funis.service';
import { LeadMonitoramentoService } from '../leads/monitoramento/lead-monitoramento.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { requireTenantId } from '../common/utils/tenant';
import { isCorretorLike } from '../common/utils/roles';
import { canonicalizeStatus1 } from '../common/utils/documentacao-status';
import { QueryAnaliseDto, UpdateAnaliseDto } from './dto/analise.dto';

const analiseSelect = {
  id: true,
  leadId: true,
  tipoContato: true,
  stageSituacao: true,
  nome: true,
  telefone: true,
  email: true,
  origem: true,
  interesse: true,
  cidade: true,
  bairro: true,
  prioridade: true,
  renda: true,
  tags: true,
  temFgts: true,
  valorFgts: true,
  temEntrada: true,
  valorEntrada: true,
  temDependente: true,
  status: true,
  parecer: true,
  analistaId: true,
  createdAt: true,
  updatedAt: true,
  autor: { select: { id: true, name: true } },
  analista: { select: { id: true, name: true } },
  lead: {
    select: {
      id: true,
      tipo: true,
      nome: true,
      stage: true,
      corretorId: true,
      corretor: {
        select: {
          id: true,
          name: true,
          role: true,
          whatsapp: true,
          equipe: {
            select: {
              gerente: { select: { id: true, name: true } },
            },
          },
        },
      },
      construtoraId: true,
      construtora: { select: { id: true, nome: true, cor: true } },
      empreendimentoId: true,
      empreendimento: { select: { id: true, nome: true, cidade: true } },
    },
  },
} as const;

@Injectable()
export class AnaliseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teamScope: TeamScopeService,
    private readonly notificacoes: NotificacoesService,
    private readonly funis: FunisService,
    private readonly monitoramento: LeadMonitoramentoService,
  ) {}

  async list(query: QueryAnaliseDto, requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);
    await this.backfillMissing(requester);

    // Admin/analista: visão global (inclui carteira de gerente/admin).
    const isGlobal =
      requester.role === Role.admin || requester.role === Role.analista;

    const leadFilter: Prisma.LeadWhereInput = {
      perdidoAt: null,
      ...(isGlobal ? {} : await this.teamScope.leadScope(requester)),
    };

    if (query.corretorId) {
      const allowed = await this.teamScope.canAccessCorretor(
        requester,
        query.corretorId,
      );
      if (!allowed) {
        return [];
      }
      leadFilter.corretorId = query.corretorId;
    }

    return this.prisma.analise.findMany({
      where: {
        tenantId,
        lead: leadFilter,
        ...(query.status ? { status: query.status as AnaliseStatus } : {}),
      },
      select: analiseSelect,
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Totais e ranking por corretor a partir das fichas reais de análise. */
  async resumo(requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);
    await this.backfillMissing(requester);

    const isGlobal =
      requester.role === Role.admin || requester.role === Role.analista;
    const leadFilter: Prisma.LeadWhereInput = {
      perdidoAt: null,
      ...(isGlobal ? {} : await this.teamScope.leadScope(requester)),
    };

    const vendaSlugs = await this.funis.getSlugsByPapel(
      tenantId,
      FunilEtapaPapel.venda,
    );
    const vendaSet = new Set(vendaSlugs);

    const rows = await this.prisma.analise.findMany({
      where: { tenantId, lead: leadFilter },
      select: {
        status: true,
        stageSituacao: true,
        lead: {
          select: {
            stage: true,
            corretorId: true,
            corretor: { select: { id: true, name: true } },
          },
        },
      },
    });

    const totais = {
      emAnalise: 0,
      aprovado: 0,
      reprovado: 0,
      vendidos: 0,
    };
    type RankingBucket = {
      corretorId: string | null;
      nome: string;
      total: number;
      emAnalise: number;
      aprovados: number;
      reprovados: number;
      vendidos: number;
    };
    const byCorretor = new Map<string, RankingBucket>();

    const isVendido = (stage: string, stageSituacao: string) =>
      vendaSet.has(stage) || vendaSet.has(stageSituacao);

    for (const row of rows) {
      const vendido = isVendido(row.lead.stage, row.stageSituacao);
      if (
        row.status === AnaliseStatus.em_analise ||
        row.status === AnaliseStatus.pendente
      ) {
        totais.emAnalise += 1;
      } else if (row.status === AnaliseStatus.aprovado) {
        totais.aprovado += 1;
      } else if (row.status === AnaliseStatus.reprovado) {
        totais.reprovado += 1;
      }
      if (vendido) totais.vendidos += 1;

      const key = row.lead.corretorId ?? '__none__';
      const bucket = byCorretor.get(key) ?? {
        corretorId: row.lead.corretorId,
        nome: row.lead.corretor?.name ?? 'Sem corretor',
        total: 0,
        emAnalise: 0,
        aprovados: 0,
        reprovados: 0,
        vendidos: 0,
      };
      bucket.total += 1;
      if (
        row.status === AnaliseStatus.em_analise ||
        row.status === AnaliseStatus.pendente
      ) {
        bucket.emAnalise += 1;
      } else if (row.status === AnaliseStatus.aprovado) {
        bucket.aprovados += 1;
      } else if (row.status === AnaliseStatus.reprovado) {
        bucket.reprovados += 1;
      }
      if (vendido) bucket.vendidos += 1;
      byCorretor.set(key, bucket);
    }

    const ranking = [...byCorretor.values()].sort(
      (a, b) => b.total - a.total || a.nome.localeCompare(b.nome, 'pt-BR'),
    );

    return { totais, ranking, vendaSlugs };
  }

  async findOne(id: string, requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);
    const item = await this.prisma.analise.findFirst({
      where: { id, tenantId },
      select: analiseSelect,
    });
    if (!item) {
      throw new NotFoundException('Análise não encontrada.');
    }
    await this.ensureLeadAccessible(item.leadId, requester);
    return item;
  }

  /** Analista assume processo da fila: pendente → em_analise. */
  async assumir(id: string, requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);
    const existing = await this.prisma.analise.findFirst({
      where: { id, tenantId },
      select: { id: true, leadId: true, status: true },
    });
    if (!existing) {
      throw new NotFoundException('Análise não encontrada.');
    }
    await this.ensureLeadAccessible(existing.leadId, requester);

    if (existing.status !== AnaliseStatus.pendente) {
      throw new BadRequestException(
        'Só é possível assumir processos com status pendente.',
      );
    }

    const updated = await this.prisma.analise.update({
      where: { id },
      data: {
        status: AnaliseStatus.em_analise,
        analistaId: requester.id,
      },
      select: analiseSelect,
    });

    // Fichas ainda em pré-análise (legado) passam a Em análise ao assumir.
    await this.prisma.documentacao.updateMany({
      where: {
        tenantId,
        leadId: existing.leadId,
        status1: { in: ['Pré-análise', 'Pre-análise', 'Análise', 'Analise'] },
      },
      data: { status1: 'Em análise' },
    });

    return updated;
  }

  async update(
    id: string,
    dto: UpdateAnaliseDto,
    requester: AuthenticatedUser,
  ) {
    const tenantId = requireTenantId(requester);
    const existing = await this.prisma.analise.findFirst({
      where: { id, tenantId },
      select: {
        id: true,
        leadId: true,
        status: true,
        nome: true,
        analistaId: true,
        lead: { select: { corretorId: true } },
      },
    });
    if (!existing) {
      throw new NotFoundException('Análise não encontrada.');
    }
    await this.ensureLeadAccessible(existing.leadId, requester);

    if (dto.status !== undefined) {
      const next = dto.status as AnaliseStatus;
      if (
        (next === AnaliseStatus.aprovado || next === AnaliseStatus.reprovado) &&
        existing.status === AnaliseStatus.pendente &&
        requester.role === Role.analista
      ) {
        throw new BadRequestException(
          'Assuma o processo (Em análise) antes de registrar o parecer.',
        );
      }
    }

    const updated = await this.prisma.analise.update({
      where: { id },
      data: {
        ...(dto.status !== undefined
          ? { status: dto.status as AnaliseStatus }
          : {}),
        ...(dto.parecer !== undefined
          ? { parecer: dto.parecer?.trim() || null }
          : {}),
        ...(requester.role === Role.analista && !existing.analistaId
          ? { analistaId: requester.id }
          : {}),
      },
      select: analiseSelect,
    });

    const newStatus = updated.status;
    const statusChanged =
      dto.status !== undefined && dto.status !== existing.status;
    if (
      statusChanged &&
      (newStatus === AnaliseStatus.aprovado ||
        newStatus === AnaliseStatus.reprovado)
    ) {
      await this.syncDocumentacaoFromAnalise(
        tenantId,
        existing.leadId,
        newStatus,
        dto.vgv,
      );
      await this.leaveAnaliseAfterParecer(
        tenantId,
        existing.leadId,
        requester.id,
        newStatus,
      );

      const notifyIds = new Set<string>();
      if (
        existing.lead.corretorId &&
        existing.lead.corretorId !== requester.id
      ) {
        notifyIds.add(existing.lead.corretorId);
      }
      if (existing.lead.corretorId) {
        const gerenteId = await this.resolveGerenteOfCorretor(
          existing.lead.corretorId,
          tenantId,
        );
        if (gerenteId && gerenteId !== requester.id) {
          notifyIds.add(gerenteId);
        }
      }
      await Promise.all(
        [...notifyIds].map((userId) =>
          this.notificacoes.createAnaliseResultado({
            userId,
            leadId: existing.leadId,
            analiseId: updated.id,
            nomeProcesso: updated.nome,
            status: newStatus,
            parecer: updated.parecer,
          }),
        ),
      );
    }

    return updated;
  }

  /**
   * Espelha o parecer da análise no Status 1 (e VGV, se aprovado)
   * de todas as fichas de documentação do mesmo lead.
   */
  private async syncDocumentacaoFromAnalise(
    tenantId: string,
    leadId: string,
    analiseStatus: typeof AnaliseStatus.aprovado | typeof AnaliseStatus.reprovado,
    vgv?: number | null,
  ) {
    const status1 = canonicalizeStatus1(
      analiseStatus === AnaliseStatus.aprovado ? 'Aprovado' : 'Reprovado',
    );

    await this.prisma.documentacao.updateMany({
      where: {
        tenantId,
        leadId,
      },
      data: {
        status1,
        ...(analiseStatus === AnaliseStatus.aprovado &&
        vgv !== undefined &&
        vgv !== null
          ? { vgv }
          : {}),
      },
    });
  }

  /** Tira o lead da etapa Em análise após parecer aprovado/reprovado. */
  private async leaveAnaliseAfterParecer(
    tenantId: string,
    leadId: string,
    autorId: string,
    analiseStatus: typeof AnaliseStatus.aprovado | typeof AnaliseStatus.reprovado,
  ) {
    const analiseSlugs = await this.funis.getSlugsByPapel(
      tenantId,
      FunilEtapaPapel.analise,
    );
    if (analiseSlugs.length === 0) return;

    const lead = await this.prisma.lead.findFirst({
      where: {
        id: leadId,
        tenantId,
        perdidoAt: null,
        stage: { in: analiseSlugs },
      },
      select: { id: true, stage: true },
    });
    if (!lead) return;

    const lastEntry = await this.prisma.triagemEvent.findFirst({
      where: {
        leadId,
        stageNovo: { in: analiseSlugs },
        stageAnterior: { not: null },
        NOT: { stageAnterior: { in: analiseSlugs } },
      },
      orderBy: { createdAt: 'desc' },
      select: { stageAnterior: true },
    });

    let targetStage = lastEntry?.stageAnterior ?? null;
    if (!targetStage || analiseSlugs.includes(targetStage)) {
      targetStage = await this.funis.getSlugByPapel(
        tenantId,
        FunilEtapaPapel.inicial,
      );
    }
    if (!targetStage || analiseSlugs.includes(targetStage)) return;

    const parecerLabel =
      analiseStatus === AnaliseStatus.aprovado ? 'aprovado' : 'reprovado';
    const now = new Date();
    const timing = await this.monitoramento.stageChangeData(
      tenantId,
      targetStage,
      now,
    );
    await this.prisma.$transaction([
      this.prisma.lead.update({
        where: { id: leadId },
        data: { stage: targetStage, ...timing, lastTriagemAt: now },
      }),
      this.prisma.documentacao.updateMany({
        where: { tenantId, leadId },
        data: { stageSituacao: targetStage },
      }),
      this.prisma.triagemEvent.create({
        data: {
          leadId,
          autorId,
          texto: `Parecer ${parecerLabel} na análise — saiu da etapa Em análise.`,
          stageAnterior: lead.stage,
          stageNovo: targetStage,
          origem: TriagemOrigem.funil,
        },
      }),
    ]);
  }

  /**
   * Cria a ficha de análise ao entrar na etapa com papel análise (idempotente).
   * Usa snapshot do lead + última documentação, se houver.
   */
  async ensureForLead(
    leadId: string,
    autorId: string,
    tenantId: string,
    finance?: {
      temEntrada?: boolean;
      valorEntrada?: number | null;
      temFgts?: boolean;
      valorFgts?: number | null;
      temDependente?: boolean;
    },
  ) {
    const existing = await this.prisma.analise.findUnique({
      where: { leadId },
      select: { id: true },
    });
    if (existing) return existing;

    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, tenantId },
      select: {
        id: true,
        tipo: true,
        stage: true,
        nome: true,
        telefone: true,
        email: true,
        origem: true,
        interesse: true,
        cidade: true,
        bairro: true,
        prioridade: true,
        renda: true,
        tags: true,
        perdidoAt: true,
        documentacoes: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            nome: true,
            temEntrada: true,
            valorEntrada: true,
            temFgts: true,
            valorFgts: true,
            temDependente: true,
          },
        },
      },
    });

    if (!lead || lead.perdidoAt) {
      return null;
    }

    const doc = lead.documentacoes[0];
    const temEntrada = finance?.temEntrada ?? doc?.temEntrada ?? false;
    const temFgts = finance?.temFgts ?? doc?.temFgts ?? false;
    const temDependente =
      finance?.temDependente ?? doc?.temDependente ?? false;

    try {
      return await this.prisma.analise.create({
        data: {
          tenantId,
          leadId: lead.id,
          autorId,
          tipoContato: lead.tipo,
          stageSituacao: lead.stage,
          nome: (doc?.nome ?? lead.nome).trim(),
          telefone: lead.telefone.trim(),
          email: lead.email.trim().toLowerCase(),
          origem: lead.origem.trim(),
          interesse: lead.interesse,
          cidade: lead.cidade.trim(),
          bairro: lead.bairro.trim(),
          prioridade: lead.prioridade,
          renda: lead.renda ?? null,
          tags: lead.tags ?? [],
          temFgts,
          valorFgts: temFgts
            ? (finance?.valorFgts ?? doc?.valorFgts ?? null)
            : null,
          temEntrada,
          valorEntrada: temEntrada
            ? (finance?.valorEntrada ?? doc?.valorEntrada ?? null)
            : null,
          temDependente,
          status: AnaliseStatus.em_analise,
        },
        select: { id: true },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        return this.prisma.analise.findUnique({
          where: { leadId },
          select: { id: true },
        });
      }
      throw err;
    }
  }

  private async backfillMissing(requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);
    const analiseSlugs = await this.funis.getSlugsByPapel(
      tenantId,
      FunilEtapaPapel.analise,
    );

    const isGlobal =
      requester.role === Role.admin || requester.role === Role.analista;
    const leadScope = isGlobal
      ? { tenantId }
      : await this.teamScope.leadScope(requester);

    const pendingIds = new Map<string, string>();

    if (analiseSlugs.length > 0) {
      const leads = await this.prisma.lead.findMany({
        where: {
          perdidoAt: null,
          stage: { in: analiseSlugs },
          analise: null,
          ...leadScope,
        },
        select: { id: true, corretorId: true },
        take: 200,
      });
      for (const lead of leads) {
        pendingIds.set(lead.id, lead.corretorId ?? requester.id);
      }
    }

    // Documentações de gerente/admin (ou status Em análise) sem ficha de análise.
    const docs = await this.prisma.documentacao.findMany({
      where: {
        tenantId,
        lead: {
          perdidoAt: null,
          analise: null,
          ...(isGlobal ? {} : leadScope),
        },
        OR: [
          { autor: { role: { in: [Role.gerente, Role.admin, Role.analista] } } },
          {
            status1: {
              in: [
                'Em análise',
                'Análise',
                'ANALISE',
                'Em analise',
                'em análise',
                'em analise',
              ],
            },
          },
        ],
      },
      select: {
        leadId: true,
        autorId: true,
        temEntrada: true,
        valorEntrada: true,
        temFgts: true,
        valorFgts: true,
        temDependente: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    const financeByLead = new Map<
      string,
      {
        temEntrada?: boolean;
        valorEntrada?: number | null;
        temFgts?: boolean;
        valorFgts?: number | null;
        temDependente?: boolean;
      }
    >();

    for (const doc of docs) {
      if (!pendingIds.has(doc.leadId)) {
        pendingIds.set(doc.leadId, doc.autorId);
      }
      if (!financeByLead.has(doc.leadId)) {
        financeByLead.set(doc.leadId, {
          temEntrada: doc.temEntrada,
          valorEntrada: doc.valorEntrada,
          temFgts: doc.temFgts,
          valorFgts: doc.valorFgts,
          temDependente: doc.temDependente,
        });
      }
    }

    // Garante etapa de análise no funil para esses leads.
    const analiseSlug = analiseSlugs[0] ?? null;
    if (analiseSlug && pendingIds.size > 0) {
      const leadIds = [...pendingIds.keys()];
      await this.monitoramento.applyStageToLeads(
        tenantId,
        leadIds,
        analiseSlug,
      );
      await this.prisma.documentacao.updateMany({
        where: { tenantId, leadId: { in: leadIds } },
        data: { stageSituacao: analiseSlug },
      });
    }

    for (const [leadId, autorId] of pendingIds) {
      await this.ensureForLead(
        leadId,
        autorId,
        tenantId,
        financeByLead.get(leadId),
      );
    }
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
        corretorId: true,
        perdidoAt: true,
      },
    });

    if (!lead || lead.perdidoAt) {
      throw new NotFoundException('Análise não encontrada.');
    }

    if (isCorretorLike(requester.role)) {
      throw new NotFoundException('Análise não encontrada.');
    }

    const allowed = await this.teamScope.canAccessCorretor(
      requester,
      lead.corretorId,
    );
    if (!allowed) {
      throw new NotFoundException('Análise não encontrada.');
    }

    return lead;
  }

  private async resolveGerenteOfCorretor(
    corretorId: string,
    tenantId: string,
  ): Promise<string | null> {
    const corretor = await this.prisma.user.findFirst({
      where: { id: corretorId, tenantId },
      select: { equipe: { select: { gerenteId: true } } },
    });
    return corretor?.equipe?.gerenteId ?? null;
  }
}
