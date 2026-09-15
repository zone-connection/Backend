import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AnaliseStatus,
  FunilEtapaPapel,
  Prisma,
  Role,
  TriagemOrigem,
  UserStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TeamScopeService } from '../equipes/team-scope.service';
import { FunisService } from '../funis/funis.service';
import { AnaliseService } from '../analise/analise.service';
import { LeadMonitoramentoService } from '../leads/monitoramento/lead-monitoramento.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import {
  documentacaoOperacionalWhere,
  isStatusAnalise,
  isStatusAprovado,
  isStatusParecerFinal,
  isStatusVendido,
} from '../common/utils/documentacao-status';
import { PLATFORM_TENANT_ID, requireTenantId } from '../common/utils/tenant';
import { hasUserModule } from '../common/utils/user-permissions';
import { prismaTableOrderBy } from '../common/utils/table-sort';
import { CreateDocumentacaoDto } from './dto/create-documentacao.dto';
import { UpdateDocumentacaoDto } from './dto/update-documentacao.dto';
import { QueryDocumentacaoDto } from './dto/query-documentacao.dto';

const userMini = {
  select: { id: true, name: true, cor: true, role: true },
} as const;

const docSelect = {
  id: true,
  leadId: true,
  tipoContato: true,
  stageSituacao: true,
  nome: true,
  construtoraId: true,
  empreendimentoId: true,
  fonte: true,
  status1: true,
  status2: true,
  corretorId: true,
  gerenteId: true,
  dataAnalise: true,
  dataVenda: true,
  vgv: true,
  obs: true,
  temEntrada: true,
  valorEntrada: true,
  temFgts: true,
  valorFgts: true,
  temDependente: true,
  createdAt: true,
  updatedAt: true,
  autor: userMini,
  construtora: { select: { id: true, nome: true, cor: true } },
  empreendimento: { select: { id: true, nome: true, cidade: true, cor: true } },
  corretor: userMini,
  gerente: userMini,
  lead: {
    select: {
      id: true,
      tipo: true,
      nome: true,
      stage: true,
      origem: true,
      corretorId: true,
      corretor: userMini,
    },
  },
} as const;

function parseOptionalDate(value?: string | null): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const raw = value.trim();
  // Meia-noite UTC em YYYY-MM-DD desloca o dia 1º para o mês anterior
  // na janela BRT do dashboard; meio-dia UTC mantém o dia civil.
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? new Date(`${raw}T12:00:00.000Z`)
    : new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function parseOptionalCreatedAt(value?: string | null): Date | null {
  if (value === undefined || value === null || value === '') return null;
  const raw = value.trim();
  const date =
    /^\d{4}-\d{2}-\d{2}$/.test(raw)
      ? new Date(`${raw}T12:00:00.000Z`)
      : new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function todayDateOnly(): Date {
  return new Date(new Date().toISOString().slice(0, 10));
}

@Injectable()
export class DocumentacaoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teamScope: TeamScopeService,
    private readonly funis: FunisService,
    private readonly analiseService: AnaliseService,
    private readonly monitoramento: LeadMonitoramentoService,
  ) {}

  async list(query: QueryDocumentacaoDto, requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);
    if (tenantId === PLATFORM_TENANT_ID) {
      await this.syncPlatformVendasFromFunil(tenantId, requester.id);
    }
    const visibility = await this.buildVisibilityWhere(requester);

    // Evita AND: [{}] — em alguns casos o Prisma devolve lista vazia.
    const andFilters: Prisma.DocumentacaoWhereInput[] = [
      { lead: { perdidoAt: null } },
    ];
    if (!query.incluirComissoes) {
      andFilters.push(documentacaoOperacionalWhere());
    }
    if (Object.keys(visibility).length > 0) {
      andFilters.push(visibility);
    }

    if (query.corretorId && requester.role === Role.admin) {
      andFilters.push({
        OR: [
          { corretorId: query.corretorId },
          { lead: { corretorId: query.corretorId } },
        ],
      });
    }

    const docs = await this.prisma.documentacao.findMany({
      where: {
        tenantId,
        AND: andFilters,
      },
      select: docSelect,
      orderBy: prismaTableOrderBy(query.sort, 'nome'),
    });

    // Alinha funil: vendidos → Venda; parecer final → sai de Em análise
    const vendidoLeadIds = [
      ...new Set(
        docs.filter((d) => isStatusVendido(d.status2)).map((d) => d.leadId),
      ),
    ];
    const parecerLeadIds = [
      ...new Set(
        docs
          .filter(
            (d) =>
              !isStatusVendido(d.status2) && isStatusParecerFinal(d.status1),
          )
          .map((d) => d.leadId),
      ),
    ];
    let healed = false;
    if (vendidoLeadIds.length > 0) {
      await this.moveLeadsToVendaStage(
        tenantId,
        vendidoLeadIds,
        requester.id,
      );
      healed = true;
    }
    for (const leadId of parecerLeadIds) {
      const doc = docs.find((d) => d.leadId === leadId);
      if (!doc) continue;
      await this.applyParecerFromDocumentacao(
        tenantId,
        leadId,
        requester.id,
        doc.status1,
      );
      healed = true;
    }
    if (healed) {
      return this.prisma.documentacao.findMany({
        where: {
          tenantId,
          AND: andFilters,
        },
        select: docSelect,
        orderBy: prismaTableOrderBy(query.sort, 'nome'),
      });
    }

    return docs;
  }

  async findOne(id: string, requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);
    await this.assertCanView(id, tenantId, requester);
    const doc = await this.prisma.documentacao.findFirst({
      where: { id, tenantId },
      select: docSelect,
    });
    if (!doc) {
      throw new NotFoundException('Documentação não encontrada.');
    }
    return doc;
  }

  /**
   * Usuários ativos para o select de crédito na ficha.
   * Admin/analista/gerente/treinee: corretores, treinees e gerentes.
   * Corretor: apenas o próprio.
   */
  async listCorretores(requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);

    const select = {
      id: true,
      name: true,
      role: true,
      cor: true,
      equipe: {
        select: {
          gerenteId: true,
          gerente: { select: { id: true, name: true } },
        },
      },
    } as const;

    const mapRow = (u: {
      id: string;
      name: string;
      role: Role;
      cor: string | null;
      equipe: {
        gerenteId: string;
        gerente: { id: string; name: string } | null;
      } | null;
    }) => ({
      id: u.id,
      name: u.name,
      role: u.role,
      cor: u.cor,
      gerenteId: u.equipe?.gerenteId ?? null,
      gerente: u.equipe?.gerente ?? null,
    });

    if (requester.role === Role.corretor) {
      const self = await this.prisma.user.findFirst({
        where: { id: requester.id, tenantId, status: UserStatus.ativo },
        select,
      });
      return self ? [mapRow(self)] : [];
    }

    const rows = await this.prisma.user.findMany({
      where: {
        tenantId,
        status: UserStatus.ativo,
        role: { in: [Role.corretor, Role.treinee, Role.gerente] },
      },
      select,
      orderBy: { name: 'asc' },
    });
    return rows.map(mapRow);
  }

  async create(dto: CreateDocumentacaoDto, requester: AuthenticatedUser) {
    if (requester.role === Role.corretor) {
      throw new ForbiddenException(
        'Corretores não cadastram documentação. Encaminhe o lead para análise.',
      );
    }
    const tenantId = requireTenantId(requester);
    const lead = await this.ensureLeadAccessible(dto.leadId, requester);

    const corretorId = dto.corretorId
      ? await this.resolveCreditCorretorId(dto.corretorId, tenantId)
      : lead.corretorId || null;
    let gerenteId = dto.gerenteId ?? null;
    if (!gerenteId && corretorId === requester.id && requester.role === Role.gerente) {
      gerenteId = requester.id;
    } else if (!gerenteId && corretorId) {
      gerenteId = await this.resolveGerenteOfCorretor(corretorId, tenantId);
    }
    if (!gerenteId && requester.role === Role.gerente) {
      gerenteId = requester.id;
    }

    const status1 = dto.status1.trim();
    const parsedAnalise = parseOptionalDate(dto.dataAnalise);
    const dataAnalise =
      parsedAnalise ?? (isStatusAnalise(status1) ? todayDateOnly() : null);

    const status2 = dto.status2.trim();
    const createdAt = parseOptionalCreatedAt(dto.createdAt);

    // Uma ficha ativa por lead: evita duplicar (comercial + analista).
    const existingLatest = await this.prisma.documentacao.findFirst({
      where: { tenantId, leadId: lead.id },
      select: { id: true, status2: true },
      orderBy: { createdAt: 'desc' },
    });
    const reuseId =
      existingLatest && !isStatusVendido(existingLatest.status2)
        ? existingLatest.id
        : null;

    const payload = {
      tipoContato: lead.tipo,
      stageSituacao: lead.stage,
      nome: dto.nome.trim(),
      construtoraId: dto.construtoraId || lead.construtoraId || null,
      empreendimentoId:
        dto.empreendimentoId || lead.empreendimentoId || null,
      fonte: dto.fonte.trim(),
      status1,
      status2,
      corretorId,
      gerenteId,
      dataAnalise,
      dataVenda:
        parseOptionalDate(dto.dataVenda) ??
        (isStatusVendido(status2)
          ? parseOptionalDate(new Date().toISOString().slice(0, 10)) ?? null
          : null),
      vgv: dto.vgv ?? null,
      obs: dto.obs?.trim() || null,
      temEntrada: dto.temEntrada ?? false,
      valorEntrada: dto.temEntrada ? (dto.valorEntrada ?? null) : null,
      temFgts: dto.temFgts ?? false,
      valorFgts: dto.temFgts ? (dto.valorFgts ?? null) : null,
      temDependente: dto.temDependente ?? false,
    };

    const created = reuseId
      ? await this.prisma.documentacao.update({
          where: { id: reuseId },
          data: {
            tipoContato: payload.tipoContato,
            stageSituacao: payload.stageSituacao,
            nome: payload.nome,
            construtoraId: payload.construtoraId,
            empreendimentoId: payload.empreendimentoId,
            fonte: payload.fonte,
            status1: payload.status1,
            status2: payload.status2,
            dataAnalise: payload.dataAnalise,
            dataVenda: payload.dataVenda,
            vgv: payload.vgv,
            obs: payload.obs,
            temEntrada: payload.temEntrada,
            valorEntrada: payload.valorEntrada,
            temFgts: payload.temFgts,
            valorFgts: payload.valorFgts,
            temDependente: payload.temDependente,
            // Completa vínculos; não apaga gerente/corretor já gravados.
            ...(corretorId ? { corretorId } : {}),
            ...(gerenteId ? { gerenteId } : {}),
          },
          select: docSelect,
        })
      : await this.prisma.documentacao.create({
          data: {
            tenantId,
            leadId: lead.id,
            autorId: requester.id,
            ...payload,
            ...(createdAt ? { createdAt } : {}),
          },
          select: docSelect,
        });

    // Garante que o lead fique com o corretor creditado na ficha
    // (admin pode criar venda já atribuída a outro corretor).
    if (corretorId && lead.corretorId !== corretorId) {
      await this.prisma.lead.update({
        where: { id: lead.id },
        data: { corretorId },
      });
    }

    if (isStatusVendido(status2)) {
      await this.moveLeadsToVendaStage(tenantId, [lead.id], requester.id);
    } else if (isStatusParecerFinal(status1)) {
      await this.applyParecerFromDocumentacao(
        tenantId,
        lead.id,
        requester.id,
        status1,
      );
    } else {
      await this.enqueueAnaliseFromDoc({
        leadId: lead.id,
        autorId: requester.id,
        tenantId,
        status1,
        requesterRole: requester.role,
        temEntrada: created.temEntrada,
        valorEntrada: created.valorEntrada,
        temFgts: created.temFgts,
        valorFgts: created.valorFgts,
        temDependente: created.temDependente,
      });
    }

    // Releitura: etapa do lead pode ter mudado (venda / parecer).
    const fresh = await this.prisma.documentacao.findFirst({
      where: { id: created.id, tenantId },
      select: docSelect,
    });
    return fresh ?? created;
  }

  async update(
    id: string,
    dto: UpdateDocumentacaoDto,
    requester: AuthenticatedUser,
  ) {
    const tenantId = requireTenantId(requester);
    const existing = await this.prisma.documentacao.findFirst({
      where: { id, tenantId },
      select: {
        id: true,
        leadId: true,
        dataAnalise: true,
        dataVenda: true,
        corretorId: true,
        gerenteId: true,
        status1: true,
        status2: true,
      },
    });
    if (!existing) {
      throw new NotFoundException('Documentação não encontrada.');
    }

    await this.assertCanView(id, tenantId, requester);
    if (!this.canUpdateDocumentacao(requester)) {
      throw new ForbiddenException(
        'Você não tem permissão para editar esta documentação.',
      );
    }

    const data: Prisma.DocumentacaoUpdateInput = {};
    if (dto.nome !== undefined) data.nome = dto.nome.trim();
    if (dto.construtoraId !== undefined) {
      data.construtora = dto.construtoraId
        ? { connect: { id: dto.construtoraId } }
        : { disconnect: true };
    }
    if (dto.empreendimentoId !== undefined) {
      data.empreendimento = dto.empreendimentoId
        ? { connect: { id: dto.empreendimentoId } }
        : { disconnect: true };
    }
    if (dto.fonte !== undefined) data.fonte = dto.fonte.trim();
    if (dto.status1 !== undefined) {
      data.status1 = dto.status1.trim();
    }
    if (dto.status2 !== undefined) {
      data.status2 = dto.status2.trim();
    }
    if (dto.corretorId !== undefined) {
      const resolvedCorretorId = await this.resolveCreditCorretorId(
        dto.corretorId,
        tenantId,
      );
      data.corretor = resolvedCorretorId
        ? { connect: { id: resolvedCorretorId } }
        : { disconnect: true };
    }
    if (dto.gerenteId !== undefined) {
      if (dto.gerenteId) {
        data.gerente = { connect: { id: dto.gerenteId } };
      } else {
        const corretorForResolve =
          dto.corretorId !== undefined
            ? dto.corretorId
            : existing.corretorId;
        const resolved = corretorForResolve
          ? await this.resolveGerenteOfCorretor(corretorForResolve, tenantId)
          : null;
        data.gerente = resolved
          ? { connect: { id: resolved } }
          : { disconnect: true };
      }
    } else if (dto.corretorId) {
      const resolved = await this.resolveGerenteOfCorretor(
        dto.corretorId,
        tenantId,
      );
      if (resolved) {
        data.gerente = { connect: { id: resolved } };
      }
    }
    if (dto.dataAnalise !== undefined) {
      data.dataAnalise = parseOptionalDate(dto.dataAnalise) ?? null;
    } else if (
      dto.status1 !== undefined &&
      isStatusAnalise(dto.status1) &&
      (!existing.dataAnalise || !isStatusAnalise(existing.status1))
    ) {
      data.dataAnalise = todayDateOnly();
    }
    if (dto.dataVenda !== undefined) {
      data.dataVenda = parseOptionalDate(dto.dataVenda) ?? null;
    } else if (
      dto.status2 !== undefined &&
      isStatusVendido(dto.status2) &&
      !existing.dataVenda &&
      !isStatusVendido(existing.status2)
    ) {
      data.dataVenda =
        parseOptionalDate(new Date().toISOString().slice(0, 10)) ?? null;
    }
    if (dto.vgv !== undefined) data.vgv = dto.vgv;
    if (dto.obs !== undefined) data.obs = dto.obs?.trim() || null;
    if (dto.temEntrada !== undefined) {
      data.temEntrada = dto.temEntrada;
      if (!dto.temEntrada) data.valorEntrada = null;
    }
    if (dto.valorEntrada !== undefined && dto.temEntrada !== false) {
      data.valorEntrada = dto.valorEntrada;
    }
    if (dto.temFgts !== undefined) {
      data.temFgts = dto.temFgts;
      if (!dto.temFgts) data.valorFgts = null;
    }
    if (dto.valorFgts !== undefined && dto.temFgts !== false) {
      data.valorFgts = dto.valorFgts;
    }
    if (dto.temDependente !== undefined) data.temDependente = dto.temDependente;
    if (dto.createdAt !== undefined) {
      const createdAt = parseOptionalCreatedAt(dto.createdAt);
      if (createdAt) data.createdAt = createdAt;
    }

    const updated = await this.prisma.documentacao.update({
      where: { id },
      data,
      select: docSelect,
    });

    const creditedCorretorId =
      dto.corretorId !== undefined ? dto.corretorId : updated.corretorId;
    if (creditedCorretorId) {
      await this.prisma.lead.updateMany({
        where: {
          id: existing.leadId,
          tenantId,
          NOT: { corretorId: creditedCorretorId },
        },
        data: { corretorId: creditedCorretorId },
      });
    }

    if (isStatusVendido(updated.status2)) {
      await this.moveLeadsToVendaStage(
        tenantId,
        [existing.leadId],
        requester.id,
      );
    } else if (isStatusParecerFinal(updated.status1)) {
      await this.applyParecerFromDocumentacao(
        tenantId,
        existing.leadId,
        requester.id,
        updated.status1,
      );
    } else {
      await this.enqueueAnaliseFromDoc({
        leadId: existing.leadId,
        autorId: requester.id,
        tenantId,
        status1: updated.status1,
        requesterRole: requester.role,
        temEntrada: updated.temEntrada,
        valorEntrada: updated.valorEntrada,
        temFgts: updated.temFgts,
        valorFgts: updated.valorFgts,
        temDependente: updated.temDependente,
      });
    }

    // Releitura: etapa do lead pode ter mudado (venda / parecer).
    const fresh = await this.prisma.documentacao.findFirst({
      where: { id, tenantId },
      select: docSelect,
    });
    return fresh ?? updated;
  }

  async remove(id: string, requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);
    const existing = await this.prisma.documentacao.findFirst({
      where: { id, tenantId },
      select: {
        id: true,
        leadId: true,
      },
    });
    if (!existing) {
      throw new NotFoundException('Documentação não encontrada.');
    }

    await this.assertCanView(id, tenantId, requester);
    if (!this.canDeleteDocumentacao(requester)) {
      throw new ForbiddenException(
        'Você não tem permissão para excluir esta documentação.',
      );
    }

    await this.prisma.documentacao.delete({ where: { id } });
    return { ok: true };
  }

  /**
   * - Corretor: fichas em que está creditado (corretorId / lead)
   * - Gerente: fichas em que é o gerente ou da própria equipe
   * - Analista / Admin: visão global do tenant
   */
  private async buildVisibilityWhere(
    requester: AuthenticatedUser,
  ): Promise<Prisma.DocumentacaoWhereInput> {
    switch (requester.role) {
      case Role.admin:
      case Role.analista:
      case Role.super_admin:
        return {};
      case Role.corretor:
      case Role.treinee:
        return {
          OR: [
            { corretorId: requester.id },
            { lead: { corretorId: requester.id } },
          ],
        };
      case Role.gerente: {
        const teamCorretorIds =
          (await this.teamScope.getVisibleCorretorIds(requester)) ?? [];
        const teamActorIds = [...new Set([...teamCorretorIds, requester.id])];
        return {
          OR: [
            { gerenteId: requester.id },
            { corretorId: { in: teamActorIds } },
            { lead: { corretorId: { in: teamActorIds } } },
          ],
        };
      }
      default:
        if (
          hasUserModule(requester.role, requester.permissions, 'documentacao') ||
          hasUserModule(requester.role, requester.permissions, 'vendas')
        ) {
          return {};
        }
        throw new ForbiddenException(
          'Você não tem permissão para acessar este recurso.',
        );
    }
  }

  private async assertCanView(
    id: string,
    tenantId: string,
    requester: AuthenticatedUser,
  ) {
    const visibility = await this.buildVisibilityWhere(requester);
    const found = await this.prisma.documentacao.findFirst({
      where: {
        id,
        tenantId,
        ...(Object.keys(visibility).length > 0 ? { AND: [visibility] } : {}),
      },
      select: { id: true },
    });
    if (!found) {
      throw new NotFoundException('Documentação não encontrada.');
    }
  }

  /**
   * Coloca o lead na fila do analista quando a ficha é de análise
   * ou quando gerente/admin/analista sobe a documentação ainda sem parecer.
   */
  private async enqueueAnaliseFromDoc(input: {
    leadId: string;
    autorId: string;
    tenantId: string;
    status1: string;
    requesterRole: Role;
    temEntrada: boolean;
    valorEntrada: number | null;
    temFgts: boolean;
    valorFgts: number | null;
    temDependente: boolean;
  }) {
    // Parecer já registrado: não recoloca na fila nem força Em análise.
    if (isStatusParecerFinal(input.status1)) return;

    const shouldEnqueue =
      isStatusAnalise(input.status1) ||
      input.requesterRole === Role.gerente ||
      input.requesterRole === Role.admin ||
      input.requesterRole === Role.analista;
    if (!shouldEnqueue) return;

    const analiseSlug = await this.funis.getSlugByPapel(
      input.tenantId,
      FunilEtapaPapel.analise,
    );
    if (analiseSlug) {
      const lead = await this.prisma.lead.findFirst({
        where: { id: input.leadId, tenantId: input.tenantId },
        select: { stage: true, perdidoAt: true },
      });
      if (lead && !lead.perdidoAt && lead.stage !== analiseSlug) {
        const timing = await this.monitoramento.stageChangeData(
          input.tenantId,
          analiseSlug,
        );
        await this.prisma.lead.update({
          where: { id: input.leadId },
          data: { stage: analiseSlug, ...timing },
        });
        await this.prisma.documentacao.updateMany({
          where: { tenantId: input.tenantId, leadId: input.leadId },
          data: { stageSituacao: analiseSlug },
        });
      }
    }

    await this.analiseService.ensureForLead(
      input.leadId,
      input.autorId,
      input.tenantId,
      {
        temEntrada: input.temEntrada,
        valorEntrada: input.valorEntrada,
        temFgts: input.temFgts,
        valorFgts: input.valorFgts,
        temDependente: input.temDependente,
      },
    );
  }

  /**
   * Espelha o parecer (Aprovado/Reprovado) na ficha de Análise e tira o lead
   * da etapa Em análise do funil (volta à etapa anterior, se houver).
   */
  private async applyParecerFromDocumentacao(
    tenantId: string,
    leadId: string,
    autorId: string,
    status1: string,
  ) {
    if (!isStatusParecerFinal(status1)) return;

    const analiseStatus = isStatusAprovado(status1)
      ? AnaliseStatus.aprovado
      : AnaliseStatus.reprovado;

    await this.prisma.analise.updateMany({
      where: {
        tenantId,
        leadId,
        status: {
          in: [AnaliseStatus.pendente, AnaliseStatus.em_analise],
        },
      },
      data: { status: analiseStatus },
    });

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

    const parecerLabel = isStatusAprovado(status1) ? 'aprovado' : 'reprovado';
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
          texto: `Parecer ${parecerLabel} na documentação — saiu da etapa Em análise.`,
          stageAnterior: lead.stage,
          stageNovo: targetStage,
          origem: TriagemOrigem.funil,
        },
      }),
    ]);
  }

  /** Admin, analista e gerente podem editar (status e demais campos). */
  private canUpdateDocumentacao(requester: AuthenticatedUser): boolean {
    return (
      requester.role === Role.admin ||
      requester.role === Role.analista ||
      requester.role === Role.gerente
    );
  }

  /** Exclusão permanece restrita a admin e analista. */
  private canDeleteDocumentacao(requester: AuthenticatedUser): boolean {
    return requester.role === Role.admin || requester.role === Role.analista;
  }

  /**
   * Super admin: lead em Ganho/Venda vira venda (ficha vendida), sem VGV.
   */
  async ensureVendaFromFunilStage(
    tenantId: string,
    leadId: string,
    autorId: string,
    stage: string,
  ) {
    if (tenantId !== PLATFORM_TENANT_ID) return;
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, tenantId, perdidoAt: null },
      select: {
        nome: true,
        tipo: true,
        origem: true,
        corretorId: true,
        construtoraId: true,
        empreendimentoId: true,
      },
    });
    if (!lead) return;

    const existing = await this.prisma.documentacao.findFirst({
      where: { tenantId, leadId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, status2: true, dataVenda: true },
    });
    const now = new Date();
    if (existing) {
      await this.prisma.documentacao.update({
        where: { id: existing.id },
        data: {
          stageSituacao: stage,
          ...(!isStatusVendido(existing.status2)
            ? { status2: 'Vendido', dataVenda: existing.dataVenda ?? now }
            : {}),
        },
      });
      return;
    }

    await this.prisma.documentacao.create({
      data: {
        tenantId,
        leadId,
        autorId,
        tipoContato: lead.tipo,
        stageSituacao: stage,
        nome: lead.nome,
        fonte: lead.origem?.trim() || 'Outro',
        status1: 'Aprovado',
        status2: 'Vendido',
        corretorId: lead.corretorId,
        construtoraId: lead.construtoraId,
        empreendimentoId: lead.empreendimentoId,
        dataVenda: now,
      },
    });
  }

  async syncPlatformVendasFromFunil(tenantId: string, autorId: string) {
    if (tenantId !== PLATFORM_TENANT_ID) return;
    const vendaSlug = await this.funis.getSlugByPapel(
      tenantId,
      FunilEtapaPapel.venda,
    );
    if (!vendaSlug) return;
    const leads = await this.prisma.lead.findMany({
      where: { tenantId, stage: vendaSlug, perdidoAt: null },
      select: { id: true, stage: true },
    });
    for (const lead of leads) {
      await this.ensureVendaFromFunilStage(
        tenantId,
        lead.id,
        autorId,
        lead.stage,
      );
    }
  }

  /**
   * Documentação vendida deve aparecer na coluna Venda do funil.
   */
  private async moveLeadsToVendaStage(
    tenantId: string,
    leadIds: string[],
    autorId: string,
  ) {
    const uniqueIds = [...new Set(leadIds.filter(Boolean))];
    if (uniqueIds.length === 0) return;

    const vendaSlug = await this.funis.getSlugByPapel(
      tenantId,
      FunilEtapaPapel.venda,
    );
    if (!vendaSlug) return;

    const leads = await this.prisma.lead.findMany({
      where: {
        tenantId,
        id: { in: uniqueIds },
        perdidoAt: null,
        NOT: { stage: vendaSlug },
      },
      select: { id: true, stage: true },
    });
    if (leads.length === 0) return;

    const leadIdsMoved = leads.map((l) => l.id);
    const now = new Date();
    const timing = await this.monitoramento.stageChangeData(
      tenantId,
      vendaSlug,
      now,
    );

    await this.prisma.$transaction([
      this.prisma.lead.updateMany({
        where: { id: { in: leadIdsMoved } },
        data: { stage: vendaSlug, ...timing, lastTriagemAt: now },
      }),
      // Mantém o snapshot da ficha alinhado à etapa atual do funil.
      this.prisma.documentacao.updateMany({
        where: { tenantId, leadId: { in: leadIdsMoved } },
        data: { stageSituacao: vendaSlug },
      }),
      this.prisma.triagemEvent.createMany({
        data: leads.map((lead) => ({
          leadId: lead.id,
          autorId,
          texto:
            'Etapa avançada para venda (documentação marcada como vendido).',
          stageAnterior: lead.stage,
          stageNovo: vendaSlug,
          origem: TriagemOrigem.funil,
        })),
      }),
    ]);
  }

  private async resolveCreditCorretorId(
    corretorId: string | null | undefined,
    tenantId: string,
  ): Promise<string | null> {
    if (corretorId == null || corretorId === '') return null;

    const user = await this.prisma.user.findFirst({
      where: {
        id: corretorId,
        tenantId,
        status: UserStatus.ativo,
        role: {
          in: [Role.corretor, Role.treinee, Role.admin, Role.gerente],
        },
      },
      select: { id: true },
    });

    if (!user) {
      throw new BadRequestException(
        'Corretor inválido ou inativo neste tenant.',
      );
    }

    return user.id;
  }

  private async resolveGerenteOfCorretor(
    corretorId: string,
    tenantId: string,
  ): Promise<string | null> {
    const corretor = await this.prisma.user.findFirst({
      where: { id: corretorId, tenantId },
      select: {
        equipe: { select: { gerenteId: true } },
      },
    });
    return corretor?.equipe?.gerenteId ?? null;
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
        construtoraId: true,
        empreendimentoId: true,
        perdidoAt: true,
      },
    });

    if (!lead || lead.perdidoAt) {
      throw new NotFoundException('Lead/cliente não encontrado.');
    }

    const allowed = await this.teamScope.canAccessCorretor(
      requester,
      lead.corretorId,
      lead.equipeId,
    );
    if (!allowed) {
      throw new NotFoundException('Lead/cliente não encontrado.');
    }

    return lead;
  }
}
