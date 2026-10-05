import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CatalogType,
  ContatoTipo,
  Prisma,
  Role,
  UserStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TeamScopeService } from '../equipes/team-scope.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import {
  canonicalizeStatus2,
  documentacaoOperacionalWhere,
  documentacaoVinculadaAoCorretorWhere,
  isStatusAnalise,
  isStatusVendido,
  status2Group,
} from '../common/utils/documentacao-status';
import { requireTenantId } from '../common/utils/tenant';
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

function todayCivilDate(): Date | null {
  return (
    parseOptionalDate(new Date().toISOString().slice(0, 10)) ?? null
  );
}

function todayDateOnly(): Date {
  return todayCivilDate() ?? new Date();
}

function status2QuandoTemVgv(
  status2: string,
  vgv: number | null | undefined,
): string {
  if (vgv == null || vgv <= 0) return status2;
  if (isStatusVendido(status2)) return status2;
  const grupo = status2Group(status2);
  if (!grupo || grupo === 'andamento') {
    return canonicalizeStatus2('Vendido');
  }
  return status2;
}

@Injectable()
export class DocumentacaoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teamScope: TeamScopeService,
  ) {}

  async list(query: QueryDocumentacaoDto, requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);
    const visibility = await this.buildVisibilityWhere(requester);

    // A ficha aparece mesmo sem lead e mesmo se o card do funil sumiu.
    const andFilters: Prisma.DocumentacaoWhereInput[] = [];
    if (!query.incluirComissoes) {
      andFilters.push(documentacaoOperacionalWhere());
    }
    if (Object.keys(visibility).length > 0) {
      andFilters.push(visibility);
    }

    if (query.corretorId && requester.role === Role.admin) {
      andFilters.push(documentacaoVinculadaAoCorretorWhere(query.corretorId));
    }

    return this.prisma.documentacao.findMany({
      where: {
        tenantId,
        ...(andFilters.length > 0 ? { AND: andFilters } : {}),
      },
      select: docSelect,
      orderBy: prismaTableOrderBy(query.sort, 'nome'),
    });
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

    const corretorId = dto.corretorId
      ? await this.resolveCreditCorretorId(dto.corretorId, tenantId)
      : null;
    let gerenteId = dto.gerenteId ?? null;
    if (!gerenteId && corretorId === requester.id && requester.role === Role.gerente) {
      gerenteId = requester.id;
    } else if (!gerenteId && corretorId) {
      gerenteId = await this.resolveGerenteOfCorretor(corretorId, tenantId);
    }
    if (!gerenteId && requester.role === Role.gerente) {
      gerenteId = requester.id;
    }

    const fonte = await this.resolveCatalogLabel(
      tenantId,
      CatalogType.documentacao_fonte,
      dto.fonte,
      'Fonte',
    );
    const status1 = await this.resolveCatalogLabel(
      tenantId,
      CatalogType.documentacao_status1,
      dto.status1,
      'Status 1',
    );
    const parsedAnalise = parseOptionalDate(dto.dataAnalise);
    const dataAnalise =
      parsedAnalise ?? (isStatusAnalise(status1) ? todayDateOnly() : null);

    const status2 = status2QuandoTemVgv(
      await this.resolveCatalogLabel(
        tenantId,
        CatalogType.documentacao_status2,
        dto.status2,
        'Status 2',
      ),
      dto.vgv,
    );
    const createdAt = parseOptionalCreatedAt(dto.createdAt);

    return this.prisma.documentacao.create({
      data: {
        tenantId,
        autorId: requester.id,
        tipoContato: ContatoTipo.lead,
        stageSituacao: '',
        nome: dto.nome.trim(),
        construtoraId: dto.construtoraId || null,
        empreendimentoId: dto.empreendimentoId || null,
        fonte,
        status1,
        status2,
        corretorId,
        gerenteId,
        dataAnalise,
        dataVenda:
          parseOptionalDate(dto.dataVenda) ??
          (isStatusVendido(status2) ? todayCivilDate() : null),
        vgv: dto.vgv ?? null,
        obs: dto.obs?.trim() || null,
        temEntrada: dto.temEntrada ?? false,
        valorEntrada: dto.temEntrada ? (dto.valorEntrada ?? null) : null,
        temFgts: dto.temFgts ?? false,
        valorFgts: dto.temFgts ? (dto.valorFgts ?? null) : null,
        temDependente: dto.temDependente ?? false,
        ...(createdAt ? { createdAt } : {}),
      },
      select: docSelect,
    });
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
        dataAnalise: true,
        dataVenda: true,
        corretorId: true,
        gerenteId: true,
        status1: true,
        status2: true,
        vgv: true,
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
    if (dto.fonte !== undefined) {
      data.fonte = await this.resolveCatalogLabel(
        tenantId,
        CatalogType.documentacao_fonte,
        dto.fonte,
        'Fonte',
      );
    }
    if (dto.status1 !== undefined) {
      data.status1 = await this.resolveCatalogLabel(
        tenantId,
        CatalogType.documentacao_status1,
        dto.status1,
        'Status 1',
      );
    }
    if (dto.status2 !== undefined) {
      data.status2 = await this.resolveCatalogLabel(
        tenantId,
        CatalogType.documentacao_status2,
        dto.status2,
        'Status 2',
      );
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
    }
    if (dto.vgv !== undefined) data.vgv = dto.vgv;

    const status2Atual =
      typeof data.status2 === 'string' ? data.status2 : existing.status2;
    const vgvAtual = dto.vgv !== undefined ? dto.vgv : existing.vgv;
    const status2Final = status2QuandoTemVgv(status2Atual, vgvAtual);
    if (status2Final !== existing.status2 || dto.status2 !== undefined) {
      data.status2 = status2Final;
    }
    if (
      dto.dataVenda === undefined &&
      isStatusVendido(status2Final) &&
      !existing.dataVenda
    ) {
      data.dataVenda = todayCivilDate();
    }
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

    return this.prisma.documentacao.update({
      where: { id },
      data,
      select: docSelect,
    });
  }

  async remove(id: string, requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);
    const existing = await this.prisma.documentacao.findFirst({
      where: { id, tenantId },
      select: {
        id: true,
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
        return documentacaoVinculadaAoCorretorWhere(requester.id);
      case Role.gerente: {
        const teamCorretorIds =
          (await this.teamScope.getVisibleCorretorIds(requester)) ?? [];
        const teamActorIds = [...new Set([...teamCorretorIds, requester.id])];
        return {
          OR: [
            { gerenteId: requester.id },
            documentacaoVinculadaAoCorretorWhere(teamActorIds),
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


  private async resolveCatalogLabel(
    tenantId: string,
    type:
      | typeof CatalogType.documentacao_fonte
      | typeof CatalogType.documentacao_status1
      | typeof CatalogType.documentacao_status2,
    raw: string,
    field: string,
  ): Promise<string> {
    const label = raw.trim();
    if (!label) {
      throw new BadRequestException(`Informe ${field}.`);
    }
    const items = await this.prisma.catalogItem.findMany({
      where: { tenantId, type, active: true },
      select: { label: true },
    });
    const found = items.find(
      (item) => item.label.trim().toLowerCase() === label.toLowerCase(),
    );
    if (!found) {
      throw new BadRequestException(
        `${field} “${label}” não está no catálogo. Cadastre em Configurações → Documentação.`,
      );
    }
    return found.label;
  }

}
