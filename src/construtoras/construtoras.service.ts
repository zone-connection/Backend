import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, Role, CatalogType } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { requireTenantId } from "../common/utils/tenant";
import { prismaTableOrderBy } from "../common/utils/table-sort";
import {
  isStatusVendido,
  status2VendidoWhere,
  documentacaoVendaNoPeriodoWhere,
} from "../common/utils/documentacao-status";
import { TeamScopeService } from "../equipes/team-scope.service";
import { QueryConstrutorasDto } from "./dto/query-construtoras.dto";
import { CreateConstrutoraDto } from "./dto/create-construtora.dto";
import { UpdateConstrutoraDto } from "./dto/update-construtora.dto";
import { MediaService } from "../media/media.service";
import {
  janelaPeriodoBrasil,
  type PeriodoGranularidade,
} from "../common/utils/periodo-brasil";

const construtoraSelect = {
  id: true,
  nome: true,
  cor: true,
  contato: true,
  endereco: true,
  viabilizadorNome: true,
  viabilizadorContato: true,
  cca: true,
  driveFolderUrl: true,
  logoUrl: true,
  logoPublicId: true,
  createdAt: true,
  updatedAt: true,
  localidades: {
    select: { id: true, nome: true },
    orderBy: { nome: "asc" as const },
  },
  _count: { select: { empreendimentos: true, documentacoes: true } },
} as const;

function normalizeCor(cor?: string | null): string | null {
  if (cor == null) return null;
  const trimmed = cor.trim();
  return trimmed ? trimmed : null;
}

function normalizeDriveFolderUrl(url?: string | null): string | null {
  if (url == null) return null;
  const trimmed = url.trim();
  return trimmed ? trimmed : null;
}

function periodoBrasil(
  mes?: number,
  ano?: number,
  granularidade?: PeriodoGranularidade,
) {
  if (mes == null && ano == null && !granularidade) return null;
  return janelaPeriodoBrasil({ mes, ano, granularidade }).atual;
}

function isoDateOnly(value: Date | null | undefined) {
  if (!value) return null;
  return value.toISOString().slice(0, 10);
}

function resolveConstrutoraId(doc: {
  construtoraId: string | null;
  empreendimento: { construtoraId: string | null } | null;
  lead: { construtoraId: string | null };
}) {
  return (
    doc.construtoraId ??
    doc.empreendimento?.construtoraId ??
    doc.lead.construtoraId ??
    null
  );
}

@Injectable()
export class ConstrutorasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teamScope: TeamScopeService,
    private readonly media: MediaService,
  ) {}

  async list(query: QueryConstrutorasDto, requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);
    const AND: Prisma.ConstrutoraWhereInput[] = [{ tenantId }];
    if (query.localidadeId) {
      AND.push({
        localidades: { some: { id: query.localidadeId } },
      });
    }
    if (query.search) {
      AND.push({
        nome: { contains: query.search, mode: "insensitive" },
      });
    }
    if (query.comDrive) {
      AND.push({ driveFolderUrl: { not: null } });
      AND.push({ NOT: { driveFolderUrl: "" } });
    }
    const items = await this.prisma.construtora.findMany({
      where: { AND },
      select: construtoraSelect,
      orderBy: prismaTableOrderBy(query.sort, "nome"),
    });
    if (!this.canViewVendas(requester)) {
      return items.map((item) => this.expose(item, requester));
    }
    const vendasMap = await this.vendasTotaisPorConstrutora(
      tenantId,
      items.map((item) => item.id),
    );
    return items.map((item) => {
      const totais = vendasMap.get(item.id) ?? { vendas: 0, vgv: 0 };
      return this.expose(
        { ...item, vendas: totais.vendas, vgv: totais.vgv },
        requester,
      );
    });
  }

  async findOne(id: string, requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);
    const item = await this.prisma.construtora.findFirst({
      where: { id, tenantId },
      select: construtoraSelect,
    });
    if (!item) throw new NotFoundException("Construtora não encontrada.");
    if (!this.canViewVendas(requester)) {
      return this.expose(item, requester);
    }
    const vendasMap = await this.vendasTotaisPorConstrutora(tenantId, [item.id]);
    const totais = vendasMap.get(item.id) ?? { vendas: 0, vgv: 0 };
    return this.expose(
      { ...item, vendas: totais.vendas, vgv: totais.vgv },
      requester,
    );
  }

  async listVendas(
    id: string,
    requester: AuthenticatedUser,
    periodo?: {
      mes?: number;
      ano?: number;
      granularidade?: PeriodoGranularidade;
    },
  ) {
    this.assertCanViewVendas(requester);
    const tenantId = requireTenantId(requester);
    const construtora = await this.prisma.construtora.findFirst({
      where: { id, tenantId },
      select: { id: true, nome: true, cor: true },
    });
    if (!construtora) {
      throw new NotFoundException("Construtora não encontrada.");
    }

    const visibleIds = await this.teamScope.getVisibleCorretorIds(requester);
    const janela = periodoBrasil(
      periodo?.mes,
      periodo?.ano,
      periodo?.granularidade,
    );
    const rows = await this.prisma.documentacao.findMany({
      where: {
        tenantId,
        AND: [
          status2VendidoWhere(),
          ...(janela ? [documentacaoVendaNoPeriodoWhere(janela)] : []),
        ],
        OR: [
          { construtoraId: id },
          { construtoraId: null, empreendimento: { construtoraId: id } },
          {
            construtoraId: null,
            empreendimentoId: null,
            lead: { construtoraId: id },
          },
        ],
      },
      select: {
        id: true,
        nome: true,
        vgv: true,
        dataVenda: true,
        createdAt: true,
        status2: true,
        construtoraId: true,
        corretor: {
          select: {
            id: true,
            name: true,
            creci: true,
            equipe: { select: { gerente: { select: { name: true } } } },
          },
        },
        gerente: { select: { name: true } },
        empreendimento: {
          select: { nome: true, construtoraId: true },
        },
        lead: {
          select: {
            construtoraId: true,
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
              orderBy: { updatedAt: "desc" },
              take: 1,
            },
          },
        },
      },
      orderBy: [{ dataVenda: "desc" }, { createdAt: "desc" }],
    });

    const items = rows
      .filter((row) => isStatusVendido(row.status2))
      .filter((row) => resolveConstrutoraId(row) === id)
      .map((row) => {
        const corretor = row.corretor ?? row.lead.corretor;
        return {
          id: row.id,
          corretorId: corretor?.id ?? null,
          corretor: corretor?.name ?? "—",
          creci: corretor?.creci ?? null,
          gerente:
            row.gerente?.name ??
            corretor?.equipe?.gerente?.name ??
            null,
          empreendimento: row.empreendimento?.nome ?? null,
          vgv: row.vgv ?? 0,
          cliente: row.nome,
          clienteCpf: row.lead.propostas[0]?.clienteCpf ?? null,
          dataVenda: isoDateOnly(row.dataVenda ?? row.createdAt),
        };
      })
      .filter((row) => {
        if (visibleIds === null) return true;
        if (!row.corretorId) return false;
        return visibleIds.includes(row.corretorId);
      });

    const corretores = new Set(
      items.map((item) => item.corretorId).filter(Boolean),
    );
    return {
      construtora,
      totais: {
        vendas: items.length,
        vgv: items.reduce((sum, item) => sum + item.vgv, 0),
        corretores: corretores.size,
      },
      items,
    };
  }

  async create(dto: CreateConstrutoraDto, requester: AuthenticatedUser) {
    this.assertCanCreate(requester);
    const tenantId = requireTenantId(requester);
    const localidadeIds = await this.resolveLocalidadeIds(
      tenantId,
      dto.localidadeIds,
    );
    return this.prisma.construtora.create({
      data: {
        tenantId,
        nome: dto.nome.trim(),
        cor: normalizeCor(dto.cor),
        contato: dto.contato?.trim() || null,
        endereco: dto.endereco?.trim() || null,
        viabilizadorNome: dto.viabilizadorNome?.trim() || null,
        viabilizadorContato: dto.viabilizadorContato?.trim() || null,
        cca: await this.resolveCca(tenantId, dto.cca),
        driveFolderUrl: normalizeDriveFolderUrl(dto.driveFolderUrl),
        ...(localidadeIds !== undefined
          ? { localidades: { connect: localidadeIds.map((id) => ({ id })) } }
          : {}),
      },
      select: construtoraSelect,
    }).then((item) => this.expose(item, requester));
  }

  async uploadLogo(
    id: string,
    rawFile: Express.Multer.File | undefined,
    requester: AuthenticatedUser,
  ) {
    this.assertCanManage(requester);
    const tenantId = requireTenantId(requester);
    const row = await this.prisma.construtora.findFirst({
      where: { id, tenantId },
      select: construtoraSelect,
    });
    if (!row) throw new NotFoundException("Construtora não encontrada.");
    const file = this.media.requireFile(rawFile);
    const uploaded = await this.media.uploadImage({
      buffer: file.buffer,
      mimetype: file.mimetype,
      folder: this.media.folder(tenantId, "construtoras", id),
      maxWidth: 800,
      maxHeight: 800,
    });
    await this.media.destroy(row.logoPublicId);
    return this.prisma.construtora
      .update({
        where: { id },
        data: { logoUrl: uploaded.url, logoPublicId: uploaded.publicId },
        select: construtoraSelect,
      })
      .then((item) => this.expose(item, requester));
  }

  async removeLogo(id: string, requester: AuthenticatedUser) {
    this.assertCanManage(requester);
    const tenantId = requireTenantId(requester);
    const row = await this.prisma.construtora.findFirst({
      where: { id, tenantId },
      select: construtoraSelect,
    });
    if (!row) throw new NotFoundException("Construtora não encontrada.");
    await this.media.destroy(row.logoPublicId);
    return this.prisma.construtora
      .update({
        where: { id },
        data: { logoUrl: null, logoPublicId: null },
        select: construtoraSelect,
      })
      .then((item) => this.expose(item, requester));
  }

  async update(
    id: string,
    dto: UpdateConstrutoraDto,
    requester: AuthenticatedUser,
  ) {
    this.assertCanManage(requester);
    await this.findOne(id, requester);
    const tenantId = requireTenantId(requester);
    const localidadeIds = await this.resolveLocalidadeIds(
      tenantId,
      dto.localidadeIds,
    );
    const cca =
      dto.cca !== undefined
        ? await this.resolveCca(tenantId, dto.cca)
        : undefined;
    return this.prisma.construtora.update({
      where: { id },
      data: {
        ...(dto.nome !== undefined ? { nome: dto.nome.trim() } : {}),
        ...(dto.cor !== undefined ? { cor: normalizeCor(dto.cor) } : {}),
        ...(dto.contato !== undefined
          ? { contato: dto.contato?.trim() || null }
          : {}),
        ...(dto.endereco !== undefined
          ? { endereco: dto.endereco?.trim() || null }
          : {}),
        ...(dto.viabilizadorNome !== undefined
          ? { viabilizadorNome: dto.viabilizadorNome?.trim() || null }
          : {}),
        ...(dto.viabilizadorContato !== undefined &&
        requester.role !== Role.corretor
          ? { viabilizadorContato: dto.viabilizadorContato?.trim() || null }
          : {}),
        ...(cca !== undefined ? { cca } : {}),
        ...(dto.driveFolderUrl !== undefined
          ? { driveFolderUrl: normalizeDriveFolderUrl(dto.driveFolderUrl) }
          : {}),
        ...(localidadeIds !== undefined
          ? { localidades: { set: localidadeIds.map((id) => ({ id })) } }
          : {}),
      },
      select: construtoraSelect,
    }).then((item) => this.expose(item, requester));
  }

  async remove(id: string, requester: AuthenticatedUser) {
    this.assertCanDelete(requester);
    const tenantId = requireTenantId(requester);
    const row = await this.prisma.construtora.findFirst({
      where: { id, tenantId },
      select: { id: true, logoPublicId: true },
    });
    if (!row) throw new NotFoundException("Construtora não encontrada.");
    await this.media.destroy(row.logoPublicId);
    await this.prisma.construtora.delete({ where: { id } });
    return { ok: true };
  }

  private async resolveCca(
    tenantId: string,
    cca?: string | null,
  ): Promise<string | null> {
    const label = cca?.trim() || null;
    if (!label) return null;
    const item = await this.prisma.catalogItem.findFirst({
      where: { tenantId, type: CatalogType.cca, label, active: true },
      select: { label: true },
    });
    if (!item) {
      throw new BadRequestException(
        "CCA inválido. Cadastre o CCA em Configurações.",
      );
    }
    return item.label;
  }

  private async resolveLocalidadeIds(
    tenantId: string,
    ids?: string[],
  ): Promise<string[] | undefined> {
    if (ids === undefined) return undefined;
    const unique = [...new Set(ids)];
    if (unique.length === 0) return [];
    const found = await this.prisma.localidade.findMany({
      where: { tenantId, id: { in: unique } },
      select: { id: true },
    });
    if (found.length !== unique.length) {
      throw new NotFoundException(
        "Uma ou mais localidades são inválidas para esta imobiliária.",
      );
    }
    return unique;
  }

  private async vendasTotaisPorConstrutora(
    tenantId: string,
    ids: string[],
  ) {
    const totais = new Map<string, { vendas: number; vgv: number }>();
    if (ids.length === 0) return totais;
    const idSet = new Set(ids);
    const rows = await this.prisma.documentacao.findMany({
      where: {
        tenantId,
        AND: [status2VendidoWhere()],
        OR: [
          { construtoraId: { in: ids } },
          {
            construtoraId: null,
            empreendimento: { construtoraId: { in: ids } },
          },
          {
            construtoraId: null,
            empreendimentoId: null,
            lead: { construtoraId: { in: ids } },
          },
        ],
      },
      select: {
        vgv: true,
        status2: true,
        construtoraId: true,
        empreendimento: { select: { construtoraId: true } },
        lead: { select: { construtoraId: true } },
      },
    });
    for (const row of rows) {
      if (!isStatusVendido(row.status2)) continue;
      const construtoraId = resolveConstrutoraId(row);
      if (!construtoraId || !idSet.has(construtoraId)) continue;
      const current = totais.get(construtoraId) ?? { vendas: 0, vgv: 0 };
      current.vendas += 1;
      current.vgv += row.vgv ?? 0;
      totais.set(construtoraId, current);
    }
    return totais;
  }

  private canViewVendas(requester: AuthenticatedUser) {
    return requester.role === Role.admin || requester.role === Role.gerente;
  }

  private assertCanViewVendas(requester: AuthenticatedUser) {
    if (!this.canViewVendas(requester)) {
      throw new ForbiddenException(
        "Apenas administradores e gerentes podem ver vendas das construtoras.",
      );
    }
  }

  private expose<
    T extends {
      logoPublicId: string | null;
      viabilizadorContato: string | null;
    },
  >(item: T, requester: AuthenticatedUser) {
    const { logoPublicId: _publicId, ...rest } = item;
    return this.hideViabilizadorContatoIfNeeded(rest, requester);
  }

  private hideViabilizadorContatoIfNeeded<
    T extends { viabilizadorContato: string | null },
  >(item: T, requester: AuthenticatedUser): T {
    if (requester.role !== Role.corretor) return item;
    return { ...item, viabilizadorContato: null };
  }

  private assertCanDelete(requester: AuthenticatedUser) {
    if (requester.role !== Role.admin && requester.role !== Role.treinee) {
      throw new ForbiddenException(
        "Apenas administradores e treinees podem remover construtoras.",
      );
    }
  }

  private assertCanManage(requester: AuthenticatedUser) {
    if (
      requester.role !== Role.admin &&
      requester.role !== Role.gerente &&
      requester.role !== Role.analista &&
      requester.role !== Role.treinee &&
      requester.role !== Role.corretor
    ) {
      throw new ForbiddenException(
        "Apenas administradores, gerentes, analistas, treinees e corretores podem editar construtoras.",
      );
    }
  }

  private assertCanCreate(requester: AuthenticatedUser) {
    if (
      requester.role !== Role.admin &&
      requester.role !== Role.gerente &&
      requester.role !== Role.analista &&
      requester.role !== Role.treinee &&
      requester.role !== Role.corretor
    ) {
      throw new ForbiddenException(
        "Apenas administradores, gerentes, analistas, treinees e corretores podem cadastrar construtoras.",
      );
    }
  }
}
