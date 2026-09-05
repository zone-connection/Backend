import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ContatoTipo,
  CatalogType,
  FunilEtapaPapel,
  Prisma,
  Role,
  TriagemOrigem,
  UserStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import {
  PLATFORM_TENANT_ID,
  requireTenantId,
  canViewLostLeads,
} from '../common/utils/tenant';
import { prismaTableOrderBy } from '../common/utils/table-sort';
import { isCorretorLike } from '../common/utils/roles';
import { hasUserAction } from '../common/utils/user-permissions';
import { CatalogService } from '../catalog/catalog.service';
import { TeamScopeService } from '../equipes/team-scope.service';
import { AnaliseService } from '../analise/analise.service';
import { FunisService } from '../funis/funis.service';
import { LeadMonitoramentoService } from './monitoramento/lead-monitoramento.service';
import { DocumentacaoService } from '../documentacao/documentacao.service';
import { leadSelect, LeadEntity } from './lead-select';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { QueryLeadsDto } from './dto/query-leads.dto';
import { CheckImportLeadsDto, ImportLeadsDto } from './dto/import-leads.dto';
import { AdiarPrazoDto } from './dto/adiar-prazo.dto';
import type { LeadMonitoramento } from './monitoramento/lead-monitoramento.types';
import {
  DistribuirCorretoresDto,
  DistribuirEquipesDto,
} from './dto/distribuir-leads.dto';
import { sanitizeProspeccao } from './lead-prospeccao';

/** Dígitos nacionais (DDD + número), ignora DDI 55. */
function nationalPhoneKey(value: string): string {
  let digits = value.replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length >= 12) {
    digits = digits.slice(2);
  }
  return digits.slice(0, 11);
}

function isSyntheticEmail(email: string | null | undefined): boolean {
  const n = (email ?? '').trim().toLowerCase();
  return (
    !n ||
    n.endsWith('@sem-email.local') ||
    n.endsWith('@pendente.local') ||
    n.endsWith('@sememail.local')
  );
}

export type LeadWithDocStatus = LeadEntity & {
  documentacaoStatus1: string | null;
  documentacaoStatus2: string | null;
};

export type LeadWithMonitoramento = LeadWithDocStatus & {
  monitoramento: LeadMonitoramento;
};

export interface PaginatedLeads {
  data: Array<LeadWithDocStatus & { monitoramento?: LeadMonitoramento }>;
  meta: { total: number; page: number; limit: number; totalPages: number };
}

/** Expõe Status 1/2 da ficha mais recente no root do lead (cards do funil). */
function withDocumentacaoStatus<T extends LeadEntity>(lead: T): T & {
  documentacaoStatus1: string | null;
  documentacaoStatus2: string | null;
} {
  const latest = lead.documentacoes?.[0];
  return {
    ...lead,
    documentacaoStatus1: latest?.status1 ?? null,
    documentacaoStatus2: latest?.status2 ?? null,
  };
}

/** Aceita ISO ou YYYY-MM-DD para cadastro retroativo. */
function parseOptionalCreatedAt(value?: string | null): Date | null {
  if (value === undefined || value === null || value === '') return null;
  const raw = value.trim();
  const date =
    /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T12:00:00.000Z`) : new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException('Data de cadastro inválida.');
  }
  return date;
}

@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
    private readonly teamScope: TeamScopeService,
    private readonly analiseService: AnaliseService,
    private readonly funis: FunisService,
    private readonly monitoramento: LeadMonitoramentoService,
    private readonly documentacao: DocumentacaoService,
  ) {}

  async create(
    dto: CreateLeadDto,
    requester: AuthenticatedUser,
  ): Promise<LeadEntity> {
    const tenantId = requireTenantId(requester);

    if (
      requester.role === Role.analista &&
      dto.tipo !== 'cliente' &&
      !hasUserAction(requester.role, requester.permissions, 'leads.create')
    ) {
      throw new ForbiddenException(
        'Analistas podem criar somente clientes para documentação.',
      );
    }

    // Corretor só cria leads para si; admin/gerente atribuem corretor e/ou equipe.
    const assignment = await this.resolveAssignment(
      { corretorId: dto.corretorId, equipeId: dto.equipeId },
      requester,
      tenantId,
    );

    const stage = dto.stage ?? (await this.catalog.getDefaultStageSlug(tenantId));
    await this.ensureStageIsValid(tenantId, stage);

    const telefone = dto.telefone.trim();
    const phoneDigits = telefone.replace(/\D/g, "");
    const emailRaw = dto.email?.trim().toLowerCase() || "";
    const email =
      emailRaw ||
      `contato.${phoneDigits || Date.now()}@sem-email.local`;

    const createdAt = parseOptionalCreatedAt(dto.createdAt);
    const timing = await this.monitoramento.stageChangeData(
      tenantId,
      stage,
      createdAt ?? new Date(),
    );
    const prospeccao = sanitizeProspeccao(dto.prospeccao);

    const created = await this.prisma.lead.create({
      data: {
        tenantId,
        tipo: dto.tipo === 'cliente' ? ContatoTipo.cliente : ContatoTipo.lead,
        nome: dto.nome.trim(),
        telefone,
        email,
        origem: dto.origem?.trim() || 'Não informado',
        interesse: dto.interesse,
        cidade: dto.cidade.trim(),
        bairro: dto.bairro.trim(),
        stage,
        prioridade: dto.prioridade ?? 'Média',
        renda: dto.renda ?? null,
        tipoRenda: dto.tipoRenda?.trim() || null,
        estadoCivil: dto.estadoCivil?.trim() || null,
        orcamentoMax: dto.orcamentoMax ?? null,
        quartosMin: dto.quartosMin ?? null,
        vagasMin: dto.vagasMin ?? null,
        ...(prospeccao !== undefined ? { prospeccao } : {}),
        tags: dto.tags ?? [],
        corretorId: assignment.corretorId,
        equipeId: assignment.equipeId,
        ...(createdAt ? { createdAt } : {}),
        ...timing,
      },
      select: leadSelect,
    });
    return this.decorateOne(created, requester);
  }

  async importMany(dto: ImportLeadsDto, requester: AuthenticatedUser) {
    if (
      requester.role === Role.analista &&
      !hasUserAction(requester.role, requester.permissions, 'leads.create')
    ) {
      throw new ForbiddenException('Analistas não podem importar contatos.');
    }

    const tenantId = requireTenantId(requester);
    const defaultStage = await this.catalog.getDefaultStageSlug(tenantId);
    await this.ensureStageIsValid(tenantId, defaultStage);
    const tipo =
      dto.tipo === 'cliente' ? ContatoTipo.cliente : ContatoTipo.lead;
    const importTiming = await this.monitoramento.stageChangeData(
      tenantId,
      defaultStage,
    );
    const origemByLabel = await this.catalog.ensureOrigensForImport(
      tenantId,
      dto.leads.map(
        (item) => (item.origem?.trim() || 'Importação').slice(0, 60),
      ),
    );

    const kindLabel = tipo === ContatoTipo.cliente ? 'cliente' : 'lead';
    const existing = await this.loadImportExistingIndex(tenantId, tipo);

    const created: LeadEntity[] = [];
    const errors: Array<{ index: number; nome: string; message: string }> = [];
    const seenPhones = new Set<string>(existing.phone.keys());
    const seenEmails = new Set<string>(existing.email.keys());

    for (let index = 0; index < dto.leads.length; index++) {
      const item = dto.leads[index];
      const phoneKey = nationalPhoneKey(item.telefone);
      const emailKey = item.email?.trim().toLowerCase() || '';
      if (phoneKey && existing.phone.has(phoneKey)) {
        const nomeExistente = existing.phone.get(phoneKey) ?? '';
        errors.push({
          index,
          nome: item.nome,
          message: `Já existe um ${kindLabel} na base com este telefone${
            nomeExistente ? ` (${nomeExistente})` : ''
          }.`,
        });
        continue;
      }
      if (phoneKey && seenPhones.has(phoneKey)) {
        errors.push({
          index,
          nome: item.nome,
          message: 'Telefone repetido nesta importação.',
        });
        continue;
      }
      if (emailKey && !isSyntheticEmail(emailKey) && existing.email.has(emailKey)) {
        const nomeExistente = existing.email.get(emailKey) ?? '';
        errors.push({
          index,
          nome: item.nome,
          message: `Já existe um ${kindLabel} na base com este e-mail${
            nomeExistente ? ` (${nomeExistente})` : ''
          }.`,
        });
        continue;
      }
      if (emailKey && !isSyntheticEmail(emailKey) && seenEmails.has(emailKey)) {
        errors.push({
          index,
          nome: item.nome,
          message: 'E-mail repetido nesta importação.',
        });
        continue;
      }
      if (phoneKey) seenPhones.add(phoneKey);
      if (emailKey && !isSyntheticEmail(emailKey)) seenEmails.add(emailKey);

      try {
        /**
         * Importação de leads começa sem dono (pool).
         * Clientes vão para a carteira de quem importa (ou corretor explícito).
         */
        let corretorId: string | null = null;
        if (item.corretorId) {
          await this.ensureCorretorAssignable(item.corretorId, requester);
          corretorId = item.corretorId;
        } else if (this.isCorretor(requester)) {
          corretorId = requester.id;
        } else if (
          tipo === ContatoTipo.cliente &&
          (requester.role === Role.admin || requester.role === Role.gerente)
        ) {
          corretorId = requester.id;
        }

        const digits = item.telefone.replace(/\D/g, '');
        const email =
          item.email?.trim().toLowerCase() ||
          `import.${digits || index}@sem-email.local`;
        const origemRaw = (item.origem?.trim() || 'Importação').slice(0, 60);
        const prospeccao = sanitizeProspeccao(item.prospeccao);

        const lead = await this.prisma.lead.create({
          data: {
            tenantId,
            tipo,
            nome: item.nome.trim(),
            telefone: item.telefone.trim(),
            email,
            origem: origemByLabel.get(origemRaw) ?? origemRaw,
            interesse: item.interesse ?? 'Comprar',
            cidade: (item.cidade?.trim() || 'Não informado').slice(0, 80),
            bairro: (item.bairro?.trim() || 'Não informado').slice(0, 80),
            stage: defaultStage,
            prioridade: item.prioridade ?? 'Média',
            renda: item.renda ?? null,
            tipoRenda: item.tipoRenda?.trim() || null,
            estadoCivil: item.estadoCivil?.trim() || null,
            ...(prospeccao !== undefined ? { prospeccao } : {}),
            tags: ['Importação'],
            corretorId,
            ...importTiming,
          },
          select: leadSelect,
        });
        created.push(lead);
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : 'Falha ao importar este registro.';
        errors.push({
          index,
          nome: item.nome,
          message,
        });
      }
    }

    return {
      ok: true,
      total: dto.leads.length,
      created: created.length,
      failed: errors.length,
      leads: created,
      errors,
    };
  }

  /** Resumo para o diálogo de distribuição (pool do admin → equipes e/ou corretores). */
  async distribuirResumo(requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);

    if (
      requester.role !== Role.admin &&
      requester.role !== Role.gerente
    ) {
      throw new ForbiddenException(
        'Somente admin e gerente podem distribuir leads.',
      );
    }

    const disponiveis = await this.prisma.lead.count({
      where: {
        tenantId,
        tipo: ContatoTipo.lead,
        perdidoAt: null,
        corretorId: null,
        equipeId: null,
      },
    });
    const [equipes, corretores] = await Promise.all([
      this.prisma.equipe.findMany({
        where: { tenantId },
        select: {
          id: true,
          name: true,
          status: true,
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
      this.prisma.user.findMany({
        where: {
          tenantId,
          role: { in: [Role.corretor, Role.treinee] },
          status: UserStatus.ativo,
        },
        select: {
          id: true,
          name: true,
          equipe: { select: { id: true, name: true } },
        },
        orderBy: { name: 'asc' },
      }),
    ]);

    return {
      disponiveis,
      equipes: equipes.map((e) => ({
        equipeId: e.id,
        nome: e.name,
        gerente: e.gerente.name,
        corretores: e.membros.length,
        status: e.status,
      })),
      corretores: corretores.map((c) => ({
        id: c.id,
        nome: c.name,
        equipeNome: c.equipe?.name ?? null,
      })),
    };
  }

  /** Admin/gerente: aloca leads sem dono (pool do admin) para o pool das equipes. */
  async distribuirEquipes(
    dto: DistribuirEquipesDto,
    requester: AuthenticatedUser,
  ) {
    if (
      requester.role !== Role.admin &&
      requester.role !== Role.gerente
    ) {
      throw new ForbiddenException(
        'Somente admin ou gerente distribuem entre equipes.',
      );
    }
    const tenantId = requireTenantId(requester);
    const totalPedido = dto.alocacoes.reduce((s, a) => s + a.quantidade, 0);
    if (totalPedido <= 0) {
      throw new BadRequestException('Informe ao menos 1 lead para distribuir.');
    }

    const equipeIds = dto.alocacoes.map((a) => a.equipeId);
    const equipes = await this.prisma.equipe.findMany({
      where: {
        tenantId,
        id: { in: equipeIds },
      },
      select: { id: true, name: true },
    });
    if (equipes.length !== new Set(equipeIds).size) {
      throw new BadRequestException('Uma ou mais equipes são inválidas.');
    }

    const leads = await this.prisma.lead.findMany({
      where: {
        tenantId,
        tipo: ContatoTipo.lead,
        perdidoAt: null,
        corretorId: null,
        equipeId: null,
      },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
      take: totalPedido,
    });

    if (leads.length < totalPedido) {
      throw new BadRequestException(
        `Há apenas ${leads.length} lead(s) disponíveis para distribuir (pedido: ${totalPedido}).`,
      );
    }

    let offset = 0;
    const resultado: Array<{
      equipeId: string;
      nome: string;
      quantidade: number;
    }> = [];

    await this.prisma.$transaction(async (tx) => {
      for (const aloc of dto.alocacoes) {
        if (aloc.quantidade <= 0) continue;
        const slice = leads.slice(offset, offset + aloc.quantidade);
        offset += aloc.quantidade;
        await tx.lead.updateMany({
          where: { id: { in: slice.map((l) => l.id) } },
          data: { equipeId: aloc.equipeId },
        });
        const eq = equipes.find((e) => e.id === aloc.equipeId)!;
        resultado.push({
          equipeId: eq.id,
          nome: eq.name,
          quantidade: slice.length,
        });
      }
    });

    return { ok: true, total: totalPedido, alocacoes: resultado };
  }

  /**
   * Admin/gerente: pool do admin → corretores.
   * Com `alocacoes`: quantidades explícitas por corretor.
   * Sem `alocacoes`: round-robin com `porCorretor` entre todos os ativos.
   */
  async distribuirCorretores(
    dto: DistribuirCorretoresDto,
    requester: AuthenticatedUser,
  ) {
    if (
      requester.role !== Role.gerente &&
      requester.role !== Role.admin
    ) {
      throw new ForbiddenException(
        'Somente admin ou gerente podem distribuir leads aos corretores.',
      );
    }
    const tenantId = requireTenantId(requester);
    const leadWhere: Prisma.LeadWhereInput = {
      tenantId,
      tipo: ContatoTipo.lead,
      perdidoAt: null,
      corretorId: null,
      equipeId: null,
    };

    if (dto.alocacoes?.length) {
      const totalPedido = dto.alocacoes.reduce((s, a) => s + a.quantidade, 0);
      if (totalPedido <= 0) {
        throw new BadRequestException(
          'Informe ao menos 1 lead para distribuir.',
        );
      }

      const corretorIds = dto.alocacoes.map((a) => a.corretorId);
      const corretores = await this.prisma.user.findMany({
        where: {
          tenantId,
          id: { in: corretorIds },
          role: { in: [Role.corretor, Role.treinee] },
          status: UserStatus.ativo,
        },
        select: { id: true, name: true, equipeId: true },
      });
      if (corretores.length !== new Set(corretorIds).size) {
        throw new BadRequestException(
          'Um ou mais corretores são inválidos ou inativos.',
        );
      }

      const leads = await this.prisma.lead.findMany({
        where: leadWhere,
        select: { id: true },
        orderBy: { createdAt: 'asc' },
        take: totalPedido,
      });
      if (leads.length < totalPedido) {
        throw new BadRequestException(
          `Há apenas ${leads.length} lead(s) disponíveis para distribuir (pedido: ${totalPedido}).`,
        );
      }

      let offset = 0;
      const resultado: Array<{
        corretorId: string;
        nome: string;
        quantidade: number;
      }> = [];
      const byId = new Map(corretores.map((c) => [c.id, c]));

      await this.prisma.$transaction(async (tx) => {
        for (const aloc of dto.alocacoes!) {
          if (aloc.quantidade <= 0) continue;
          const slice = leads.slice(offset, offset + aloc.quantidade);
          offset += aloc.quantidade;
          const corretor = byId.get(aloc.corretorId)!;
          await tx.lead.updateMany({
            where: { id: { in: slice.map((l) => l.id) } },
            data: {
              corretorId: corretor.id,
              equipeId: corretor.equipeId,
            },
          });
          resultado.push({
            corretorId: corretor.id,
            nome: corretor.name,
            quantidade: slice.length,
          });
        }
      });

      return {
        ok: true,
        total: totalPedido,
        porCorretor: null,
        distribuicao: resultado,
      };
    }

    const porCorretor = dto.porCorretor ?? 1;
    const corretores = await this.prisma.user.findMany({
      where: {
        tenantId,
        role: { in: [Role.corretor, Role.treinee] },
        status: UserStatus.ativo,
      },
      select: { id: true, name: true, equipeId: true },
      orderBy: { name: 'asc' },
    });

    if (corretores.length === 0) {
      throw new BadRequestException(
        'Não há corretores ativos para receber leads.',
      );
    }

    const leads = await this.prisma.lead.findMany({
      where: leadWhere,
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });

    if (leads.length === 0) {
      throw new BadRequestException(
        'Não há leads sem dono para distribuir.',
      );
    }

    const counts = new Map(corretores.map((c) => [c.id, 0]));
    const assignments: Array<{
      leadId: string;
      corretorId: string;
      equipeId: string | null;
    }> = [];

    let leadIdx = 0;
    let corretorIdx = 0;
    while (leadIdx < leads.length) {
      const corretor = corretores[corretorIdx % corretores.length]!;
      const take = Math.min(porCorretor, leads.length - leadIdx);
      for (let i = 0; i < take; i++) {
        const lead = leads[leadIdx++]!;
        assignments.push({
          leadId: lead.id,
          corretorId: corretor.id,
          equipeId: corretor.equipeId,
        });
        counts.set(corretor.id, (counts.get(corretor.id) ?? 0) + 1);
      }
      corretorIdx += 1;
    }

    await this.prisma.$transaction(
      assignments.map((a) =>
        this.prisma.lead.update({
          where: { id: a.leadId },
          data: { corretorId: a.corretorId, equipeId: a.equipeId },
        }),
      ),
    );

    return {
      ok: true,
      total: assignments.length,
      porCorretor,
      distribuicao: corretores.map((c) => ({
        corretorId: c.id,
        nome: c.name,
        quantidade: counts.get(c.id) ?? 0,
      })),
    };
  }

  async findAll(
    query: QueryLeadsDto,
    requester: AuthenticatedUser,
  ): Promise<PaginatedLeads> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const search = query.search?.trim();
    const searchDigits = search?.replace(/\D/g, '') ?? '';

    let phoneMatchIds: string[] = [];
    if (searchDigits.length >= 3) {
      const rows = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM leads
        WHERE regexp_replace(telefone, '[^0-9]', '', 'g')
          LIKE ${`%${searchDigits}%`}
      `;
      phoneMatchIds = rows.map((r) => r.id);
    }

    const leadScope =
      isCorretorLike(requester.role) &&
      hasUserAction(requester.role, requester.permissions, 'leads.viewOthers')
        ? { tenantId: requireTenantId(requester) }
        : await this.teamScope.leadScope(requester);
    const tipoFiltro = query.tipo as ContatoTipo | undefined;
    const adminVeClientesCorretor =
      requester.role === Role.admin &&
      requester.tenantModules?.adminVerClientesCorretor === true;
    const isGestorCarteira =
      (requester.role === Role.admin && !adminVeClientesCorretor) ||
      requester.role === Role.gerente;

    const where: Prisma.LeadWhereInput = {
      perdidoAt: null,
      ...(tipoFiltro ? { tipo: tipoFiltro } : {}),
      ...leadScope,
      ...(query.stage ? { stage: query.stage } : {}),
      ...(query.interesse ? { interesse: query.interesse } : {}),
      ...(query.prioridade ? { prioridade: query.prioridade } : {}),
      ...(query.origem ? { origem: query.origem } : {}),
    };

    const andExtra: Prisma.LeadWhereInput[] = [];

    // Cliente = carteira pessoal: admin/gerente nunca listam clientes do corretor.
    if (isGestorCarteira) {
      if (tipoFiltro === ContatoTipo.cliente) {
        where.corretorId = requester.id;
      } else if (!tipoFiltro) {
        andExtra.push({
          OR: [
            { tipo: ContatoTipo.lead },
            { tipo: ContatoTipo.cliente, corretorId: requester.id },
          ],
        });
      }
    }

    if (search) {
      andExtra.push({
        OR: [
          { nome: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { telefone: { contains: search, mode: 'insensitive' } },
          { bairro: { contains: search, mode: 'insensitive' } },
          { cidade: { contains: search, mode: 'insensitive' } },
          ...(phoneMatchIds.length > 0
            ? [{ id: { in: phoneMatchIds } }]
            : []),
        ],
      });
    }

    if (andExtra.length > 0) {
      where.AND = [
        ...(Array.isArray(where.AND)
          ? where.AND
          : where.AND
            ? [where.AND]
            : []),
        ...andExtra,
      ];
    }

    if (query.corretorId && !this.isCorretor(requester)) {
      const allowed = await this.teamScope.canAccessCorretor(
        requester,
        query.corretorId,
      );
      if (!allowed) {
        return {
          data: [],
          meta: { total: 0, page, limit, totalPages: 1 },
        };
      }
      where.corretorId = query.corretorId;
    }

    if (query.equipeId && !this.isCorretor(requester)) {
      const equipe = await this.prisma.equipe.findFirst({
        where: {
          id: query.equipeId,
          tenantId: requireTenantId(requester),
          ...(requester.role === Role.gerente
            ? { gerenteId: requester.id }
            : {}),
        },
        select: {
          id: true,
          membros: { select: { id: true } },
        },
      });
      if (!equipe) {
        return {
          data: [],
          meta: { total: 0, page, limit, totalPages: 1 },
        };
      }
      const membroIds = equipe.membros.map((m) => m.id);
      where.AND = [
        ...(Array.isArray(where.AND)
          ? where.AND
          : where.AND
            ? [where.AND]
            : []),
        {
          OR: [
            { equipeId: equipe.id },
            ...(membroIds.length > 0
              ? [{ corretorId: { in: membroIds } }]
              : []),
          ],
        },
      ];
    }

    const tenantId = requireTenantId(requester);
    const monCtx = await this.monitoramento.loadFunilContext(tenantId);
    const monWhere = this.monitoramento.monitoramentoWhere(
      query.monitoramento,
      new Date(),
      monCtx,
    );
    if (monWhere) {
      where.AND = [
        ...(Array.isArray(where.AND)
          ? where.AND
          : where.AND
            ? [where.AND]
            : []),
        monWhere,
      ];
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.lead.findMany({
        where,
        select: leadSelect,
        orderBy: prismaTableOrderBy(query.sort, 'nome'),
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.lead.count({ where }),
    ]);

    const decorated = await this.monitoramento.decorateLeadsWithTarefas(
      data,
      monCtx,
      requester,
    );

    const leadIds = decorated.map((lead) => lead.id);
    const docs =
      leadIds.length === 0
        ? []
        : await this.prisma.documentacao.findMany({
            where: { tenantId, leadId: { in: leadIds } },
            orderBy: { updatedAt: 'desc' },
            select: { leadId: true, status1: true, status2: true },
          });
    const latestDoc = new Map<
      string,
      { status1: string; status2: string }
    >();
    for (const doc of docs) {
      if (!latestDoc.has(doc.leadId)) {
        latestDoc.set(doc.leadId, {
          status1: doc.status1,
          status2: doc.status2,
        });
      }
    }

    return {
      data: decorated.map((lead) => {
        const fromBatch = latestDoc.get(lead.id);
        const fromNested = lead.documentacoes?.[0];
        return {
          ...lead,
          documentacaoStatus1:
            fromBatch?.status1 ?? fromNested?.status1 ?? null,
          documentacaoStatus2:
            fromBatch?.status2 ?? fromNested?.status2 ?? null,
        };
      }),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async findOne(
    id: string,
    requester: AuthenticatedUser,
  ): Promise<LeadEntity> {
    const tenantId = requireTenantId(requester);
    const lead = await this.prisma.lead.findFirst({
      where: { id, tenantId },
      select: leadSelect,
    });

    if (!lead) {
      throw new NotFoundException('Lead não encontrado.');
    }

    // Perdidos: admin vê leads; corretor vê os próprios clientes.
    if (lead.perdidoAt) {
      const adminLead =
        canViewLostLeads(requester) && lead.tipo === ContatoTipo.lead;
      const corretorCliente =
        isCorretorLike(requester.role) &&
        lead.tipo === ContatoTipo.cliente &&
        lead.corretorId === requester.id;
      if (!adminLead && !corretorCliente) {
        throw new NotFoundException('Lead não encontrado.');
      }
      return this.decorateOne(lead, requester);
    }

    await this.ensureCanAccess(lead, requester);
    return this.decorateOne(lead, requester);
  }

  /**
   * Lista leads marcados como perdidos — exclusivo do admin.
   */
  async findLost(
    query: QueryLeadsDto,
    requester: AuthenticatedUser,
  ): Promise<PaginatedLeads> {
    const tenantId = requireTenantId(requester);
    if (!canViewLostLeads(requester)) {
      throw new ForbiddenException(
        'Apenas administradores podem ver leads perdidos.',
      );
    }

    return this.findLostByTipo(tenantId, ContatoTipo.lead, query);
  }

  /**
   * Lista clientes marcados como perdidos — exclusivo do corretor (própria carteira).
   */
  async findLostClientes(
    query: QueryLeadsDto,
    requester: AuthenticatedUser,
  ): Promise<PaginatedLeads> {
    const tenantId = requireTenantId(requester);
    if (!isCorretorLike(requester.role)) {
      throw new ForbiddenException(
        'Apenas corretores e treinees podem ver perda de cliente.',
      );
    }

    return this.findLostByTipo(tenantId, ContatoTipo.cliente, query, {
      corretorId: requester.id,
    });
  }

  private async findLostByTipo(
    tenantId: string,
    tipo: ContatoTipo,
    query: QueryLeadsDto,
    force?: { corretorId?: string },
  ): Promise<PaginatedLeads> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const search = query.search?.trim();

    const where: Prisma.LeadWhereInput = {
      tenantId,
      tipo,
      perdidoAt: { not: null },
      ...(force?.corretorId
        ? { corretorId: force.corretorId }
        : query.corretorId
          ? { corretorId: query.corretorId }
          : {}),
      ...(query.origem ? { origem: query.origem } : {}),
      ...(query.interesse ? { interesse: query.interesse } : {}),
      ...(search
        ? {
            OR: [
              { nome: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
              { telefone: { contains: search, mode: 'insensitive' } },
              { motivoPerda: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.lead.findMany({
        where,
        select: leadSelect,
        orderBy: prismaTableOrderBy(query.sort, 'nome'),
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.lead.count({ where }),
    ]);

    return {
      data: data.map(withDocumentacaoStatus),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async update(
    id: string,
    dto: UpdateLeadDto,
    requester: AuthenticatedUser,
  ): Promise<LeadEntity> {
    const tenantId = requireTenantId(requester);
    await this.ensureExistsAndAccessible(id, requester);

    // Corretor não pode reatribuir o lead para outra pessoa.
    let assignment:
      | { corretorId: string | null; equipeId: string | null }
      | undefined;
    if (dto.corretorId !== undefined || dto.equipeId !== undefined) {
      if (this.isCorretor(requester)) {
        throw new ForbiddenException(
          'Você não pode reatribuir o lead para outro corretor.',
        );
      }
      const current = await this.prisma.lead.findFirst({
        where: { id, tenantId },
        select: { corretorId: true, equipeId: true },
      });
      // Sempre reenvia o par completo: se só equipe muda, zera corretor (pool);
      // se só corretor muda, herda equipe do corretor.
      const nextCorretorId =
        dto.corretorId !== undefined
          ? dto.corretorId
          : dto.equipeId !== undefined
            ? null
            : (current?.corretorId ?? null);
      const nextEquipeId =
        dto.equipeId !== undefined
          ? dto.equipeId
          : dto.corretorId !== undefined
            ? null
            : (current?.equipeId ?? null);
      assignment = await this.resolveAssignment(
        {
          corretorId: nextCorretorId,
          equipeId: nextEquipeId,
        },
        requester,
        tenantId,
      );
    }

    if (dto.stage !== undefined) {
      await this.ensureStageIsValid(tenantId, dto.stage);
    }

    const currentStage =
      dto.stage !== undefined
        ? await this.prisma.lead.findFirst({
            where: { id, tenantId },
            select: { stage: true },
          })
        : null;
    const stageChanged =
      dto.stage !== undefined && currentStage && currentStage.stage !== dto.stage;
    const timing = stageChanged
      ? await this.monitoramento.stageChangeData(tenantId, dto.stage!)
      : null;

    const updated = await this.prisma.lead.update({
      where: { id },
      data: {
        ...(dto.nome !== undefined ? { nome: dto.nome.trim() } : {}),
        ...(dto.telefone !== undefined ? { telefone: dto.telefone.trim() } : {}),
        ...(dto.email !== undefined
          ? {
              email: dto.email?.trim()
                ? dto.email.toLowerCase().trim()
                : `contato.${(dto.telefone ?? '').replace(/\D/g, '') || id.slice(0, 8)}@sem-email.local`,
            }
          : {}),
        ...(dto.origem !== undefined
          ? { origem: dto.origem.trim() || 'Não informado' }
          : {}),
        ...(dto.interesse !== undefined ? { interesse: dto.interesse } : {}),
        ...(dto.cidade !== undefined ? { cidade: dto.cidade.trim() } : {}),
        ...(dto.bairro !== undefined ? { bairro: dto.bairro.trim() } : {}),
        ...(dto.stage !== undefined ? { stage: dto.stage } : {}),
        ...(dto.prioridade !== undefined ? { prioridade: dto.prioridade } : {}),
        ...(dto.renda !== undefined ? { renda: dto.renda } : {}),
        ...(dto.tipoRenda !== undefined
          ? {
              tipoRenda:
                dto.tipoRenda === null ? null : dto.tipoRenda.trim() || null,
            }
          : {}),
        ...(dto.estadoCivil !== undefined
          ? {
              estadoCivil:
                dto.estadoCivil === null
                  ? null
                  : dto.estadoCivil.trim() || null,
            }
          : {}),
        ...(dto.orcamentoMax !== undefined
          ? { orcamentoMax: dto.orcamentoMax }
          : {}),
        ...(dto.quartosMin !== undefined ? { quartosMin: dto.quartosMin } : {}),
        ...(dto.vagasMin !== undefined ? { vagasMin: dto.vagasMin } : {}),
        ...(dto.prospeccao !== undefined
          ? { prospeccao: sanitizeProspeccao(dto.prospeccao) }
          : {}),
        ...(dto.tags !== undefined ? { tags: dto.tags } : {}),
        ...(assignment
          ? {
              corretorId: assignment.corretorId,
              equipeId: assignment.equipeId,
            }
          : {}),
        ...(dto.createdAt !== undefined
          ? {
              createdAt:
                parseOptionalCreatedAt(dto.createdAt) ?? undefined,
            }
          : {}),
        ...(timing ?? {}),
      },
      select: leadSelect,
    });
    if (!stageChanged) {
      await this.monitoramento.recordMovement(id, 'edicao');
    }
    return this.decorateOne(updated, requester);
  }

  async updateStage(
    id: string,
    dto: {
      stage: string;
      construtoraId?: string;
      empreendimentoId?: string;
      omitTriagem?: boolean;
      temEntrada?: boolean;
      valorEntrada?: number | null;
      temFgts?: boolean;
      valorFgts?: number | null;
      temDependente?: boolean;
    },
    requester: AuthenticatedUser,
  ): Promise<LeadEntity> {
    const tenantId = requireTenantId(requester);
    await this.ensureExistsAndAccessible(id, requester);
    const stage = dto.stage;
    await this.ensureStageIsValid(tenantId, stage);

    const previous = await this.prisma.lead.findFirst({
      where: { id, tenantId },
      select: {
        stage: true,
        construtoraId: true,
        empreendimentoId: true,
      },
    });
    const stageAnterior = previous?.stage ?? null;

    if (requester.role === Role.analista) {
      // Analista não move o funil comercial; opera pela fila de Análise.
      throw new ForbiddenException(
        'Analistas operam pela fila de Análise (Assumir / parecer).',
      );
    }

    let construtoraId = previous?.construtoraId ?? null;
    let empreendimentoId = previous?.empreendimentoId ?? null;

    const stagePapel = await this.funis.getPapelBySlug(tenantId, stage);
    const isAnalise = stagePapel === FunilEtapaPapel.analise;

    if (isAnalise) {
      if (dto.construtoraId) construtoraId = dto.construtoraId;
      if (dto.empreendimentoId) empreendimentoId = dto.empreendimentoId;
    }

    const stageChanged = Boolean(stageAnterior && stageAnterior !== stage);
    const timing = stageChanged
      ? await this.monitoramento.stageChangeData(tenantId, stage)
      : null;

    const lead = await this.prisma.lead.update({
      where: { id },
      data: {
        stage,
        ...(isAnalise && (dto.construtoraId || dto.empreendimentoId)
          ? { construtoraId, empreendimentoId }
          : {}),
        ...(timing ?? {}),
      },
      select: leadSelect,
    });

    // Alinha o snapshot de etapa nas fichas de documentação do lead.
    if (stageAnterior && stageAnterior !== stage) {
      await this.prisma.documentacao.updateMany({
        where: { tenantId, leadId: id },
        data: { stageSituacao: stage },
      });
    }

    // Registra na Triagem a mudança de etapa, salvo quando o funil vai
    // consolidar um único evento após o modal de relato.
    if (!dto.omitTriagem && stageAnterior && stageAnterior !== stage) {
      const [fromLabel, toLabel] = await Promise.all([
        this.resolveStageLabel(tenantId, stageAnterior),
        this.resolveStageLabel(tenantId, stage),
      ]);
      await this.prisma.triagemEvent.create({
        data: {
          leadId: id,
          autorId: requester.id,
          texto: `Etapa avançada de "${fromLabel}" para "${toLabel}".`,
          stageAnterior,
          stageNovo: stage,
          origem: TriagemOrigem.funil,
        },
      });
      await this.monitoramento.recordMovement(id, 'triagem');
    }

    if (isAnalise) {
      await this.analiseService.ensureForLead(id, requester.id, tenantId, {
        temEntrada: dto.temEntrada,
        valorEntrada: dto.valorEntrada,
        temFgts: dto.temFgts,
        valorFgts: dto.valorFgts,
        temDependente: dto.temDependente,
      });
    }

    if (
      tenantId === PLATFORM_TENANT_ID &&
      stageChanged &&
      stagePapel === FunilEtapaPapel.venda
    ) {
      await this.documentacao.ensureVendaFromFunilStage(
        tenantId,
        id,
        requester.id,
        stage,
      );
    }

    return this.decorateOne(lead, requester);
  }

  /** Label amigável da etapa do funil (fallback para o slug). */
  private async resolveStageLabel(
    tenantId: string,
    slug: string,
  ): Promise<string> {
    const item = await this.prisma.catalogItem.findFirst({
      where: { tenantId, type: CatalogType.funil_etapa, slug },
      select: { label: true },
    });
    return item?.label ?? slug;
  }

  /**
   * Marca lead de captação como perdido (módulo Leads Perdidos).
   * Cliente da carteira: exclusão definitiva — não entra em Leads Perdidos.
   */
  async markLost(
    id: string,
    motivo: string,
    requester: AuthenticatedUser,
  ): Promise<LeadEntity> {
    const tenantId = requireTenantId(requester);
    await this.ensureExistsAndAccessible(id, requester);

    const motivoTrim = motivo.trim();
    if (!motivoTrim) {
      throw new BadRequestException('Informe o motivo da exclusão.');
    }

    if (isCorretorLike(requester.role)) {
      const catalogMotivo = await this.prisma.catalogItem.findFirst({
        where: {
          tenantId,
          type: CatalogType.motivo_perda,
          label: motivoTrim,
          active: true,
        },
        select: { id: true },
      });
      if (!catalogMotivo) {
        throw new BadRequestException(
          'Use um motivo de perda cadastrado pela gerência.',
        );
      }
    }

    const existing = await this.prisma.lead.findFirst({
      where: { id, tenantId },
      select: leadSelect,
    });
    if (!existing) {
      throw new NotFoundException('Lead não encontrado.');
    }

    // Move para a etapa com papel perdido (fallback slug legado).
    // Clientes e leads usam soft-delete (perdidoAt) — clientes vão para
    // "Perda de cliente" (corretor); leads para "Leads Perdidos" (admin).
    const perdidoStage =
      (await this.funis.getSlugByPapel(tenantId, FunilEtapaPapel.perdido)) ??
      undefined;

    const timing = perdidoStage
      ? await this.monitoramento.stageChangeData(tenantId, perdidoStage)
      : null;

    const updated = await this.prisma.lead.update({
      where: { id },
      data: {
        perdidoAt: new Date(),
        motivoPerda: motivoTrim,
        perdidoPorId: requester.id,
        ...(perdidoStage ? { stage: perdidoStage } : {}),
        ...(timing ?? {}),
      },
      select: leadSelect,
    });
    return this.decorateOne(updated, requester);
  }

  /**
   * Soft-delete em lote: um único update, sem decorate por item
   * (o decorate individual estoura timeout/CPU em dezenas de leads).
   */
  async markLostMany(
    ids: string[],
    motivo: string,
    requester: AuthenticatedUser,
  ): Promise<{ ok: true; updated: number; skipped: number; ids: string[] }> {
    const tenantId = requireTenantId(requester);
    const unique = [...new Set(ids)];
    const motivoTrim = motivo.trim();
    if (!motivoTrim) {
      throw new BadRequestException('Informe o motivo da exclusão.');
    }

    if (isCorretorLike(requester.role)) {
      const catalogMotivo = await this.prisma.catalogItem.findFirst({
        where: {
          tenantId,
          type: CatalogType.motivo_perda,
          label: motivoTrim,
          active: true,
        },
        select: { id: true },
      });
      if (!catalogMotivo) {
        throw new BadRequestException(
          'Use um motivo de perda cadastrado pela gerência.',
        );
      }
    }

    const rows = await this.prisma.lead.findMany({
      where: {
        tenantId,
        id: { in: unique },
        perdidoAt: null,
      },
      select: { id: true, corretorId: true, equipeId: true },
    });

    const allowed = await this.filterAccessibleLeadIds(rows, requester);

    if (allowed.length === 0) {
      return { ok: true, updated: 0, skipped: unique.length, ids: [] };
    }

    const perdidoStage =
      (await this.funis.getSlugByPapel(tenantId, FunilEtapaPapel.perdido)) ??
      undefined;
    const timing = perdidoStage
      ? await this.monitoramento.stageChangeData(tenantId, perdidoStage)
      : null;
    const now = new Date();

    await this.prisma.lead.updateMany({
      where: { tenantId, id: { in: allowed }, perdidoAt: null },
      data: {
        perdidoAt: now,
        motivoPerda: motivoTrim,
        perdidoPorId: requester.id,
        ...(perdidoStage ? { stage: perdidoStage } : {}),
        ...(timing ?? {}),
      },
    });

    return {
      ok: true,
      updated: allowed.length,
      skipped: unique.length - allowed.length,
      ids: allowed,
    };
  }

  async remove(id: string, requester: AuthenticatedUser): Promise<void> {
    const tenantId = requireTenantId(requester);
    // Hard delete só para admin/super_admin, e apenas de leads já perdidos.
    if (!canViewLostLeads(requester)) {
      throw new ForbiddenException(
        'Para remover um lead da operação, informe o motivo — ele irá para Leads Perdidos.',
      );
    }
    const lead = await this.prisma.lead.findFirst({
      where: { id, tenantId },
      select: { id: true, perdidoAt: true },
    });
    if (!lead) {
      throw new NotFoundException('Lead não encontrado.');
    }
    if (!lead.perdidoAt) {
      throw new BadRequestException(
        'Marque o lead como perdido antes de excluí-lo definitivamente.',
      );
    }

    // Comissão aponta para Documentacao com onDelete: Restrict — limpar antes do cascade.
    try {
      await this.prisma.$transaction(async (tx) => {
        const docs = await tx.documentacao.findMany({
          where: { tenantId, leadId: id },
          select: { id: true },
        });
        const docIds = docs.map((d) => d.id);
        if (docIds.length > 0) {
          await tx.financeiroComissao.deleteMany({
            where: { tenantId, documentacaoId: { in: docIds } },
          });
        }
        await tx.lead.delete({ where: { id } });
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2003'
      ) {
        throw new BadRequestException(
          'Não foi possível excluir o lead: há registros financeiros ou vínculos que impedem a remoção.',
        );
      }
      throw err;
    }
  }

  async removeMany(
    ids: string[],
    requester: AuthenticatedUser,
  ): Promise<{ ok: true; deleted: number; failed: number; failedIds: string[] }> {
    const tenantId = requireTenantId(requester);
    if (!canViewLostLeads(requester)) {
      throw new ForbiddenException(
        'Para remover um lead da operação, informe o motivo — ele irá para Leads Perdidos.',
      );
    }

    const unique = [...new Set(ids)];
    const leads = await this.prisma.lead.findMany({
      where: {
        tenantId,
        id: { in: unique },
        perdidoAt: { not: null },
      },
      select: { id: true },
    });
    const allowed = leads.map((l) => l.id);
    const failedIds: string[] = unique.filter((id) => !allowed.includes(id));

    if (allowed.length === 0) {
      return { ok: true, deleted: 0, failed: failedIds.length, failedIds };
    }

    const CHUNK = 40;
    let deleted = 0;
    const pending = [...allowed];
    while (pending.length > 0) {
      const chunk = pending.splice(0, CHUNK);
      const docs = await this.prisma.documentacao.findMany({
        where: { tenantId, leadId: { in: chunk } },
        select: { id: true },
      });
      const docIds = docs.map((d) => d.id);
      try {
        await this.prisma.$transaction(async (tx) => {
          if (docIds.length > 0) {
            await tx.financeiroComissao.deleteMany({
              where: { tenantId, documentacaoId: { in: docIds } },
            });
          }
          await tx.lead.deleteMany({
            where: { tenantId, id: { in: chunk } },
          });
        });
        deleted += chunk.length;
      } catch (err) {
        if (
          !(
            err instanceof Prisma.PrismaClientKnownRequestError &&
            err.code === 'P2003'
          )
        ) {
          throw err;
        }
        for (const id of chunk) {
          try {
            await this.remove(id, requester);
            deleted += 1;
          } catch {
            failedIds.push(id);
          }
        }
      }
    }

    return { ok: true, deleted, failed: failedIds.length, failedIds };
  }

  /**
   * Lista corretores ativos para o select de atribuição.
   * Admin/analista: todos os corretores do tenant.
   * Gerente: apenas corretores da própria equipe.
   * Corretor: apenas o próprio.
   * Inclui gerenteId da equipe do corretor (para auto-preencher documentação).
   */
  async listAssignees(requester: AuthenticatedUser): Promise<
    {
      id: string;
      name: string;
      role: Role;
      cor: string | null;
      gerenteId: string | null;
      gerente: { id: string; name: string } | null;
    }[]
  > {
    const tenantId = requireTenantId(requester);
    const assigneeSelect = {
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

    const mapAssignee = (u: {
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

    if (this.isCorretor(requester)) {
      const self = await this.prisma.user.findFirst({
        where: { id: requester.id, tenantId },
        select: assigneeSelect,
      });
      if (!self) {
        return [
          {
            id: requester.id,
            name: requester.name,
            role: requester.role,
            cor: null,
            gerenteId: null,
            gerente: null,
          },
        ];
      }
      return [mapAssignee(self)];
    }

    // Admin e analista veem todos os corretores do tenant.
    // Gerente usa o escopo da equipe (TeamScopeService).
    const seeAllCorretores =
      requester.role === Role.admin ||
      requester.role === Role.super_admin ||
      requester.role === Role.analista;
    const ids = seeAllCorretores
      ? null
      : await this.teamScope.getVisibleCorretorIds(requester);

    // Analista/admin/gerente: inclui carteiras de gestores no funil/análise.
    const includeCarteiraGestores =
      requester.role === Role.admin ||
      requester.role === Role.super_admin ||
      requester.role === Role.gerente ||
      requester.role === Role.analista;

    const rows = await this.prisma.user.findMany({
      where: {
        tenantId,
        status: UserStatus.ativo,
        OR: [
          {
            role: { in: [Role.corretor, Role.treinee] },
            ...(ids !== null
              ? {
                  id: {
                    in: ids.filter((id) => id !== requester.id),
                  },
                }
              : {}),
          },
          ...(includeCarteiraGestores
            ? requester.role === Role.analista
              ? [{ role: Role.admin }, { role: Role.gerente }]
              : [{ id: requester.id }]
            : []),
        ],
      },
      select: assigneeSelect,
      orderBy: { name: 'asc' },
    });
    return rows.map(mapAssignee);
  }

  // --- Helpers de RBAC ---

  private isCorretor(requester: AuthenticatedUser): boolean {
    return isCorretorLike(requester.role);
  }

  private async ensureCanAccess(
    lead: { corretorId: string | null; equipeId?: string | null },
    requester: AuthenticatedUser,
  ): Promise<void> {
    const allowed = await this.teamScope.canAccessCorretor(
      requester,
      lead.corretorId,
      lead.equipeId,
    );
    if (!allowed) {
      throw new NotFoundException('Lead não encontrado.');
    }
  }

  private async filterAccessibleLeadIds(
    rows: Array<{
      id: string;
      corretorId: string | null;
      equipeId: string | null;
    }>,
    requester: AuthenticatedUser,
  ): Promise<string[]> {
    const visible = await this.teamScope.getVisibleCorretorIds(requester);
    let gerenteEquipeIds: Set<string> | null = null;
    if (requester.role === Role.gerente) {
      const equipes = await this.prisma.equipe.findMany({
        where: { gerenteId: requester.id, tenantId: requireTenantId(requester) },
        select: { id: true },
      });
      gerenteEquipeIds = new Set(equipes.map((e) => e.id));
    }

    return rows
      .filter((lead) => {
        if (!lead.corretorId) {
          if (
            requester.role === Role.admin ||
            requester.role === Role.super_admin ||
            requester.role === Role.analista
          ) {
            return true;
          }
          if (requester.role === Role.gerente) {
            if (!lead.equipeId) return true;
            return gerenteEquipeIds?.has(lead.equipeId) ?? false;
          }
          return false;
        }
        if (
          (requester.role === Role.admin ||
            requester.role === Role.super_admin ||
            requester.role === Role.gerente) &&
          lead.corretorId === requester.id
        ) {
          return true;
        }
        if (visible === null) return true;
        return visible.includes(lead.corretorId);
      })
      .map((l) => l.id);
  }

  private async ensureExistsAndAccessible(
    id: string,
    requester: AuthenticatedUser,
  ): Promise<void> {
    const tenantId = requireTenantId(requester);
    const lead = await this.prisma.lead.findFirst({
      where: { id, tenantId },
      select: { id: true, corretorId: true, equipeId: true, perdidoAt: true },
    });
    if (!lead || lead.perdidoAt) {
      throw new NotFoundException('Lead não encontrado.');
    }
    await this.ensureCanAccess(lead, requester);
  }

  /**
   * Resolve corretor + equipe para create/update.
   * - Corretor: sempre ele mesmo
   * - Admin/gerente: equipe e/ou corretor; também podem atribuir a si (carteira própria)
   */
  private async resolveAssignment(
    dto: { corretorId?: string | null; equipeId?: string | null },
    requester: AuthenticatedUser,
    tenantId: string,
  ): Promise<{ corretorId: string | null; equipeId: string | null }> {
    if (this.isCorretor(requester)) {
      const self = await this.prisma.user.findFirst({
        where: { id: requester.id, tenantId },
        select: { equipeId: true },
      });
      return {
        corretorId: requester.id,
        equipeId: self?.equipeId ?? null,
      };
    }

    let corretorId =
      dto.corretorId && dto.corretorId.trim() !== ''
        ? dto.corretorId
        : null;
    let equipeId =
      dto.equipeId && dto.equipeId.trim() !== '' ? dto.equipeId : null;

    // Sem corretor e sem equipe: lead fica sem vínculo (admin/gerente).
    // Não forçar a equipe do gerente automaticamente.

    if (corretorId) {
      await this.ensureCorretorAssignable(corretorId, requester);
      const owner = await this.prisma.user.findFirst({
        where: { id: corretorId, tenantId },
        select: { equipeId: true, role: true },
      });

      if (owner?.role === Role.gerente || owner?.role === Role.admin) {
        if (!equipeId && owner.role === Role.gerente) {
          const equipe = await this.prisma.equipe.findFirst({
            where: { gerenteId: corretorId, tenantId },
            select: { id: true },
          });
          equipeId = equipe?.id ?? owner.equipeId ?? null;
        }
      } else if (equipeId) {
        if (owner?.equipeId !== equipeId) {
          throw new BadRequestException(
            'O corretor não pertence à equipe/gerente selecionado.',
          );
        }
      } else {
        equipeId = owner?.equipeId ?? null;
      }
    } else if (equipeId) {
      await this.ensureEquipeAssignable(equipeId, requester);
    }

    return { corretorId, equipeId };
  }

  private async ensureEquipeAssignable(
    equipeId: string,
    requester: AuthenticatedUser,
  ): Promise<void> {
    const tenantId = requireTenantId(requester);
    const equipe = await this.prisma.equipe.findFirst({
      where: { id: equipeId, tenantId, status: UserStatus.ativo },
      select: { id: true, gerenteId: true },
    });
    if (!equipe) {
      throw new BadRequestException(
        'Equipe informada não existe ou está inativa.',
      );
    }
    // Admin e gerente podem enviar leads a qualquer equipe do tenant.
  }

  private async ensureCorretorAssignable(
    corretorId: string,
    requester: AuthenticatedUser,
  ): Promise<void> {
    const tenantId = requireTenantId(requester);
    const target = await this.prisma.user.findFirst({
      where: {
        id: corretorId,
        tenantId,
        status: UserStatus.ativo,
        role: { in: [Role.corretor, Role.treinee, Role.admin, Role.gerente] },
      },
      select: { id: true, role: true },
    });
    if (!target) {
      throw new BadRequestException(
        'Responsável informado não existe ou está inativo.',
      );
    }

    // Admin/gerente atribuindo a si mesmos (carteira própria).
    if (
      (requester.role === Role.admin || requester.role === Role.gerente) &&
      corretorId === requester.id
    ) {
      return;
    }

    // Admin: qualquer corretor/admin/gerente do tenant.
    if (requester.role === Role.admin) {
      return;
    }

    // Gerente: qualquer corretor do tenant (própria ou outra equipe) ou a si.
    if (requester.role === Role.gerente) {
      if (!isCorretorLike(target.role)) {
        throw new ForbiddenException(
          'Você só pode atribuir leads a corretores, treinees ou a si mesmo.',
        );
      }
      return;
    }

    const allowed = await this.teamScope.canAccessCorretor(
      requester,
      corretorId,
    );
    if (!allowed) {
      throw new ForbiddenException(
        'Você só pode atribuir leads a corretores da sua equipe.',
      );
    }
  }

  /** Garante que a etapa exista entre as etapas ativas do catálogo do funil. */
  private async ensureStageIsValid(
    tenantId: string,
    stage: string,
  ): Promise<void> {
    const validStages = await this.catalog.getActiveStageSlugs(tenantId);
    if (validStages.length === 0) {
      throw new BadRequestException(
        'Nenhuma etapa do funil cadastrada. Configure as etapas em Configurações antes de criar ou mover leads.',
      );
    }
    if (!validStages.includes(stage)) {
      throw new BadRequestException('Etapa do funil inválida.');
    }
  }

  adiarPrazo(id: string, dto: AdiarPrazoDto, requester: AuthenticatedUser) {
    return this.monitoramento.adiarPrazo(id, dto, requester);
  }

  listPrazoAdiamentos(id: string, requester: AuthenticatedUser) {
    return this.monitoramento.listAdiamentos(id, requester);
  }

  listCorretoresMonitoramento(requester: AuthenticatedUser) {
    return this.monitoramento.listCorretores(requester);
  }

  syncMonitoramentoNotificacoes(requester: AuthenticatedUser) {
    return this.monitoramento.syncNotificacoes(requester);
  }

  async checkImportDuplicates(
    dto: CheckImportLeadsDto,
    requester: AuthenticatedUser,
  ) {
    const tenantId = requireTenantId(requester);
    const tipo =
      dto.tipo === 'cliente' ? ContatoTipo.cliente : ContatoTipo.lead;
    const existing = await this.loadImportExistingIndex(tenantId, tipo);
    const kindLabel = tipo === ContatoTipo.cliente ? 'cliente' : 'lead';
    const phones: Record<string, string> = {};
    const emails: Record<string, string> = {};
    for (const raw of dto.telefones ?? []) {
      const key = nationalPhoneKey(raw);
      const nome = key ? existing.phone.get(key) : undefined;
      if (key && nome) phones[key] = nome;
    }
    for (const raw of dto.emails ?? []) {
      const key = raw.trim().toLowerCase();
      if (isSyntheticEmail(key)) continue;
      const nome = existing.email.get(key);
      if (nome) emails[key] = nome;
    }
    return { tipo: kindLabel, phones, emails };
  }

  private async loadImportExistingIndex(
    tenantId: string,
    tipo: ContatoTipo,
  ) {
    const rows = await this.prisma.lead.findMany({
      where: { tenantId, tipo, perdidoAt: null },
      select: { nome: true, telefone: true, email: true },
    });
    const phone = new Map<string, string>();
    const email = new Map<string, string>();
    for (const row of rows) {
      const phoneKey = nationalPhoneKey(row.telefone);
      if (phoneKey && !phone.has(phoneKey)) phone.set(phoneKey, row.nome);
      const emailKey = row.email.trim().toLowerCase();
      if (!isSyntheticEmail(emailKey) && !email.has(emailKey)) {
        email.set(emailKey, row.nome);
      }
    }
    return { phone, email };
  }

  private async decorateOne(
    lead: LeadEntity,
    requester: AuthenticatedUser,
  ): Promise<LeadWithMonitoramento> {
    const tenantId = requireTenantId(requester);
    const fresh =
      (await this.prisma.lead.findFirst({
        where: { id: lead.id, tenantId },
        select: leadSelect,
      })) ?? lead;
    const ctx = await this.monitoramento.loadFunilContext(tenantId);
    const decorated = await this.monitoramento.decorateLeadWithTarefas(
      fresh,
      ctx,
      requester,
    );
    const latest = await this.prisma.documentacao.findFirst({
      where: { tenantId, leadId: fresh.id },
      orderBy: { updatedAt: 'desc' },
      select: { status1: true, status2: true },
    });
    return {
      ...decorated,
      documentacaoStatus1:
        latest?.status1 ?? fresh.documentacoes?.[0]?.status1 ?? null,
      documentacaoStatus2:
        latest?.status2 ?? fresh.documentacoes?.[0]?.status2 ?? null,
    };
  }
}
