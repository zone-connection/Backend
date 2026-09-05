import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { CatalogItem, CatalogType, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { isPlatformAdmin, requireTenantId } from '../common/utils/tenant';
import { CreateCatalogItemDto } from './dto/create-catalog-item.dto';
import { UpdateCatalogItemDto } from './dto/update-catalog-item.dto';
import { QueryCatalogDto } from './dto/query-catalog.dto';
import { ReorderCatalogDto } from './dto/reorder-catalog.dto';
import { slugify } from './catalog.util';
import {
  canonicalizeStatus1,
  canonicalizeStatus2,
} from '../common/utils/documentacao-status';
import {
  DEFAULT_DOCUMENTACAO_FONTES,
  DEFAULT_DOCUMENTACAO_STATUS1,
  DEFAULT_DOCUMENTACAO_STATUS2,
  DEFAULT_EMPREENDIMENTO_STATUS,
  DEFAULT_EMPREENDIMENTO_TAGS,
  DEFAULT_EMPREENDIMENTO_TIPOS,
  DEFAULT_INITIAL_STAGE_SLUG,
  DEFAULT_MOTIVOS_PERDA,
} from './catalog.defaults';
import { FunisService } from '../funis/funis.service';

export type GroupedCatalog = Record<CatalogType, CatalogItem[]>;

/** Catálogos que o analista pode criar/editar/excluir em Configurações. */
const ANALISTA_CATALOG_TYPES = new Set<CatalogType>([
  CatalogType.origem,
  CatalogType.motivo_perda,
  CatalogType.tag,
  CatalogType.cca,
  CatalogType.documentacao_fonte,
  CatalogType.documentacao_status1,
  CatalogType.documentacao_status2,
  CatalogType.empreendimento_tipo,
  CatalogType.empreendimento_status,
  CatalogType.empreendimento_tag,
]);

/** Treinee: origens, tags, CCAs e catálogos de empreendimento. Motivos de perda são definidos pela gerência. */
const TREINEE_CATALOG_TYPES = new Set<CatalogType>([
  CatalogType.origem,
  CatalogType.tag,
  CatalogType.cca,
  CatalogType.empreendimento_tipo,
  CatalogType.empreendimento_status,
  CatalogType.empreendimento_tag,
]);

const HEX_COR = /^#[0-9A-Fa-f]{6}$/;

const DOCUMENTACAO_CATALOG_DEFAULTS: Record<
  | typeof CatalogType.documentacao_fonte
  | typeof CatalogType.documentacao_status1
  | typeof CatalogType.documentacao_status2,
  readonly { label: string; color: string }[]
> = {
  [CatalogType.documentacao_fonte]: DEFAULT_DOCUMENTACAO_FONTES,
  [CatalogType.documentacao_status1]: DEFAULT_DOCUMENTACAO_STATUS1,
  [CatalogType.documentacao_status2]: DEFAULT_DOCUMENTACAO_STATUS2,
};

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => FunisService))
    private readonly funisService: FunisService,
  ) {}

  /** Lista itens de um tipo específico, ordenados. */
  async findByType(
    requester: AuthenticatedUser,
    type: CatalogType,
    activeOnly = true,
  ): Promise<CatalogItem[]> {
    const tenantId = requireTenantId(requester);
    if (type === CatalogType.funil_etapa) {
      const stages =
        await this.funisService.listActiveAsCatalogItems(tenantId);
      return activeOnly ? stages.filter((s) => s.active) : stages;
    }
    return this.prisma.catalogItem.findMany({
      where: { tenantId, type, ...(activeOnly ? { active: true } : {}) },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });
  }

  /** Lista todos os tipos, agrupados. */
  async findAllGrouped(
    requester: AuthenticatedUser,
    activeOnly = true,
  ): Promise<GroupedCatalog> {
    const tenantId = requireTenantId(requester);
    await this.ensureDocumentacaoCatalogDefaults(tenantId);
    await this.ensureMotivoPerdaDefaults(tenantId);
    await this.ensureEmpreendimentoCatalogDefaults(tenantId);

    const items = await this.prisma.catalogItem.findMany({
      where: {
        tenantId,
        type: { not: CatalogType.funil_etapa },
        ...(activeOnly ? { active: true } : {}),
      },
      orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }, { label: 'asc' }],
    });

    const grouped = {
      [CatalogType.funil_etapa]:
        await this.funisService.listActiveAsCatalogItems(tenantId),
      [CatalogType.origem]: [],
      [CatalogType.motivo_perda]: [],
      [CatalogType.tag]: [],
      [CatalogType.cca]: [],
      [CatalogType.documentacao_fonte]: [],
      [CatalogType.documentacao_status1]: [],
      [CatalogType.documentacao_status2]: [],
      [CatalogType.empreendimento_tipo]: [],
      [CatalogType.empreendimento_status]: [],
      [CatalogType.empreendimento_tag]: [],
    } as GroupedCatalog;

    if (activeOnly) {
      grouped[CatalogType.funil_etapa] = grouped[
        CatalogType.funil_etapa
      ].filter((s) => s.active);
    }

    for (const item of items) {
      grouped[item.type].push(item);
    }
    return grouped;
  }

  /**
   * Cadastra no catálogo as origens da importação que ainda não existem.
   * Reaproveita o label já cadastrado (ignora maiúsculas/minúsculas) e reativa itens inativos.
   */
  async ensureOrigensForImport(
    tenantId: string,
    labels: string[],
  ): Promise<Map<string, string>> {
    const canonical = new Map<string, string>();
    const unique = [
      ...new Set(
        labels
          .map((label) => label.trim().slice(0, 60))
          .filter((label) => label.length > 0),
      ),
    ];
    if (unique.length === 0) return canonical;

    const existing = await this.prisma.catalogItem.findMany({
      where: { tenantId, type: CatalogType.origem },
    });
    const byLower = new Map(
      existing.map((item) => [item.label.trim().toLowerCase(), item]),
    );
    let nextSort =
      existing.reduce(
        (max, item) => (item.sortOrder > max ? item.sortOrder : max),
        -1,
      ) + 1;
    const defaultColor = 'bg-slate-200 text-slate-700';

    for (const label of unique) {
      const key = label.toLowerCase();
      const found = byLower.get(key);
      if (found) {
        if (!found.active) {
          const updated = await this.prisma.catalogItem.update({
            where: { id: found.id },
            data: { active: true },
          });
          byLower.set(key, updated);
        }
        canonical.set(label, found.label);
        continue;
      }

      try {
        const created = await this.prisma.catalogItem.create({
          data: {
            tenantId,
            type: CatalogType.origem,
            label,
            slug: slugify(label),
            color: defaultColor,
            sortOrder: nextSort++,
            active: true,
          },
        });
        byLower.set(key, created);
        canonical.set(label, created.label);
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          const raced = await this.prisma.catalogItem.findUnique({
            where: {
              tenantId_type_label: {
                tenantId,
                type: CatalogType.origem,
                label,
              },
            },
          });
          if (raced) {
            if (!raced.active) {
              await this.prisma.catalogItem.update({
                where: { id: raced.id },
                data: { active: true },
              });
            }
            byLower.set(key, raced);
            canonical.set(label, raced.label);
            continue;
          }
        }
        throw err;
      }
    }

    return canonical;
  }

  /** Garante fontes/status padrão da documentação no tenant. */
  private async ensureDocumentacaoCatalogDefaults(tenantId: string) {
    for (const [type, defaults] of Object.entries(
      DOCUMENTACAO_CATALOG_DEFAULTS,
    ) as Array<
      [
        keyof typeof DOCUMENTACAO_CATALOG_DEFAULTS,
        readonly { label: string; color: string }[],
      ]
    >) {
      const count = await this.prisma.catalogItem.count({
        where: { tenantId, type },
      });
      if (count > 0) continue;
      for (const [index, item] of defaults.entries()) {
        await this.prisma.catalogItem.create({
          data: {
            tenantId,
            type,
            label: item.label,
            slug: slugify(item.label),
            color: item.color,
            sortOrder: index,
            active: true,
          },
        });
      }
    }
  }

  /** Garante motivos padrão de perda no tenant. */
  private async ensureMotivoPerdaDefaults(tenantId: string) {
    const count = await this.prisma.catalogItem.count({
      where: { tenantId, type: CatalogType.motivo_perda },
    });
    if (count > 0) return;
    for (const [index, item] of DEFAULT_MOTIVOS_PERDA.entries()) {
      await this.prisma.catalogItem.create({
        data: {
          tenantId,
          type: CatalogType.motivo_perda,
          label: item.label,
          slug: slugify(item.label),
          color: item.color,
          sortOrder: index,
          active: true,
        },
      });
    }
  }

  private async ensureEmpreendimentoCatalogDefaults(tenantId: string) {
    const defaults: Array<{
      type: CatalogType;
      items: readonly { label: string; color: string }[];
    }> = [
      {
        type: CatalogType.empreendimento_tipo,
        items: DEFAULT_EMPREENDIMENTO_TIPOS,
      },
      {
        type: CatalogType.empreendimento_status,
        items: DEFAULT_EMPREENDIMENTO_STATUS,
      },
      {
        type: CatalogType.empreendimento_tag,
        items: DEFAULT_EMPREENDIMENTO_TAGS,
      },
    ];
    for (const group of defaults) {
      const count = await this.prisma.catalogItem.count({
        where: { tenantId, type: group.type },
      });
      if (count > 0) continue;
      for (const [index, item] of group.items.entries()) {
        await this.prisma.catalogItem.create({
          data: {
            tenantId,
            type: group.type,
            label: item.label,
            slug: slugify(item.label),
            color: item.color,
            sortOrder: index,
            active: true,
          },
        });
      }
    }
  }

  async create(
    dto: CreateCatalogItemDto,
    requester: AuthenticatedUser,
  ): Promise<CatalogItem> {
    if (dto.type === CatalogType.funil_etapa) {
      throw new BadRequestException(
        'Etapas do funil são gerenciadas em Configurações → Funis.',
      );
    }
    this.assertCanMutateCatalogType(requester, dto.type);
    const tenantId = requireTenantId(requester);
    const label = dto.label.trim();
    await this.ensureLabelIsAvailable(tenantId, dto.type, label);

    const last = await this.prisma.catalogItem.findFirst({
      where: { tenantId, type: dto.type },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    const sortOrder = (last?.sortOrder ?? -1) + 1;

    return this.prisma.catalogItem.create({
      data: {
        tenantId,
        type: dto.type,
        label,
        slug: slugify(label),
        color: this.normalizeCatalogColor(dto.type, dto.color),
        sortOrder,
      },
    });
  }

  async update(
    id: string,
    dto: UpdateCatalogItemDto,
    requester: AuthenticatedUser,
  ): Promise<CatalogItem> {
    const tenantId = requireTenantId(requester);
    const existing = await this.ensureExists(id, tenantId);
    this.assertCanMutateCatalogType(requester, existing.type);

    const label = dto.label?.trim();
    if (label && label !== existing.label) {
      await this.ensureLabelIsAvailable(tenantId, existing.type, label, id);
    }

    // Slug não muda no rename: é o ID estável usado em Lead.stage e no histórico.
    const updated = await this.prisma.catalogItem.update({
      where: { id },
      data: {
        ...(label ? { label } : {}),
        ...(dto.color !== undefined
          ? { color: this.normalizeCatalogColor(existing.type, dto.color) }
          : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
    });

    if (label && label !== existing.label) {
      await this.propagateDocumentacaoLabel(
        tenantId,
        existing.type,
        existing.label,
        label,
      );
      await this.propagateCcaLabel(
        tenantId,
        existing.type,
        existing.label,
        label,
      );
      await this.propagateEmpreendimentoLabel(
        tenantId,
        existing.type,
        existing.label,
        label,
      );
    }

    return updated;
  }

  /** Soft-delete: mantém o item mas o remove das listas ativas. */
  async remove(
    id: string,
    requester: AuthenticatedUser,
  ): Promise<CatalogItem> {
    const tenantId = requireTenantId(requester);
    const existing = await this.ensureExists(id, tenantId);
    this.assertCanMutateCatalogType(requester, existing.type);
    if (
      existing.type === CatalogType.funil_etapa &&
      existing.slug === DEFAULT_INITIAL_STAGE_SLUG
    ) {
      throw new BadRequestException(
        'A etapa "Novo lead" não pode ser removida — é o status inicial dos leads.',
      );
    }
    return this.prisma.catalogItem.update({
      where: { id },
      data: { active: false },
    });
  }

  async reorder(
    dto: ReorderCatalogDto,
    requester: AuthenticatedUser,
  ): Promise<CatalogItem[]> {
    const tenantId = requireTenantId(requester);
    const items = await this.prisma.catalogItem.findMany({
      where: { tenantId, type: dto.type },
      select: { id: true },
    });
    const validIds = new Set(items.map((i) => i.id));

    for (const id of dto.orderedIds) {
      if (!validIds.has(id)) {
        throw new BadRequestException(
          'A lista de ordenação contém itens inválidos para este tipo.',
        );
      }
    }

    await this.prisma.$transaction(
      dto.orderedIds.map((id, index) =>
        this.prisma.catalogItem.update({
          where: { id },
          data: { sortOrder: index },
        }),
      ),
    );

    return this.findByType(requester, dto.type, false);
  }

  /**
   * Instala/restaura o pacote padrão de etapas no funil ativo.
   */
  async installDefaultFunnelStages(
    requester: AuthenticatedUser,
  ): Promise<CatalogItem[]> {
    const ativo = await this.funisService.getAtivo(requester);
    await this.funisService.installDefaults(ativo.id, requester);
    return this.findByType(requester, CatalogType.funil_etapa, true);
  }

  /** Slugs de etapas de funil ativas — usado para validar o stage do lead. */
  async getActiveStageSlugs(tenantId: string): Promise<string[]> {
    return this.funisService.getActiveStageSlugs(tenantId);
  }

  /**
   * Etapa inicial para novos leads: slug `novo` se ativo; senão a primeira do funil.
   */
  async getDefaultStageSlug(tenantId: string): Promise<string> {
    return this.funisService.getDefaultStageSlug(tenantId);
  }

  /**
   * Ao renomear status/fonte da documentação, atualiza as fichas que usam o rótulo antigo.
   */
  private async propagateDocumentacaoLabel(
    tenantId: string,
    type: CatalogType,
    oldLabel: string,
    newLabel: string,
  ): Promise<void> {
    const aliases = new Set<string>([oldLabel.trim()]);
    if (type === CatalogType.documentacao_status1) {
      aliases.add(canonicalizeStatus1(oldLabel));
      await this.prisma.documentacao.updateMany({
        where: {
          tenantId,
          OR: [...aliases].map((alias) => ({
            status1: { equals: alias, mode: 'insensitive' as const },
          })),
        },
        data: { status1: newLabel },
      });
      return;
    }
    if (type === CatalogType.documentacao_status2) {
      aliases.add(canonicalizeStatus2(oldLabel));
      await this.prisma.documentacao.updateMany({
        where: {
          tenantId,
          OR: [...aliases].map((alias) => ({
            status2: { equals: alias, mode: 'insensitive' as const },
          })),
        },
        data: { status2: newLabel },
      });
      return;
    }
    if (type === CatalogType.documentacao_fonte) {
      await this.prisma.documentacao.updateMany({
        where: {
          tenantId,
          fonte: { equals: oldLabel, mode: 'insensitive' },
        },
        data: { fonte: newLabel },
      });
    }
  }

  private async propagateEmpreendimentoLabel(
    tenantId: string,
    type: CatalogType,
    oldLabel: string,
    newLabel: string,
  ): Promise<void> {
    if (type === CatalogType.empreendimento_tipo) {
      await this.prisma.empreendimento.updateMany({
        where: { tenantId, tipo: oldLabel },
        data: { tipo: newLabel },
      });
      return;
    }
    if (type === CatalogType.empreendimento_status) {
      await this.prisma.empreendimento.updateMany({
        where: { tenantId, status: oldLabel },
        data: { status: newLabel },
      });
      return;
    }
    if (type !== CatalogType.empreendimento_tag) return;
    const rows = await this.prisma.empreendimento.findMany({
      where: { tenantId, tags: { has: oldLabel } },
      select: { id: true, tags: true },
    });
    for (const row of rows) {
      await this.prisma.empreendimento.update({
        where: { id: row.id },
        data: {
          tags: row.tags.map((tag) => (tag === oldLabel ? newLabel : tag)),
        },
      });
    }
  }

  private async propagateCcaLabel(
    tenantId: string,
    type: CatalogType,
    oldLabel: string,
    newLabel: string,
  ): Promise<void> {
    if (type !== CatalogType.cca) return;
    await this.prisma.construtora.updateMany({
      where: { tenantId, cca: oldLabel },
      data: { cca: newLabel },
    });
  }

  private normalizeCatalogColor(
    type: CatalogType,
    color?: string | null,
  ): string | null {
    const trimmed = color?.trim() || null;
    if (type !== CatalogType.cca) return trimmed;
    if (!trimmed) return null;
    if (!HEX_COR.test(trimmed)) {
      throw new BadRequestException(
        'Informe a cor do CCA no formato hexadecimal #RRGGBB.',
      );
    }
    return trimmed.toUpperCase();
  }

  private assertCanMutateCatalogType(
    requester: AuthenticatedUser,
    type: CatalogType,
  ) {
    if (
      isPlatformAdmin(requester) ||
      requester.role === Role.admin ||
      requester.role === Role.gerente
    ) {
      return;
    }
    if (
      requester.role === Role.analista &&
      ANALISTA_CATALOG_TYPES.has(type)
    ) {
      return;
    }
    if (
      requester.role === Role.treinee &&
      TREINEE_CATALOG_TYPES.has(type)
    ) {
      return;
    }
    if (requester.role === Role.analista) {
      throw new ForbiddenException(
        'Analistas só podem alterar documentação, origens, motivos de perda, tags, CCAs e catálogos de imóveis.',
      );
    }
    if (requester.role === Role.treinee) {
      throw new ForbiddenException(
        'Treinees só podem alterar origens, tags, CCAs e catálogos de imóveis.',
      );
    }
    if (requester.role === Role.corretor) {
      throw new ForbiddenException(
        'Corretores não podem criar ou editar itens de catálogo. Use os motivos de perda cadastrados pela gerência.',
      );
    }
    throw new ForbiddenException('Sem permissão para alterar este catálogo.');
  }

  private async ensureExists(
    id: string,
    tenantId: string,
  ): Promise<CatalogItem> {
    const item = await this.prisma.catalogItem.findFirst({
      where: { id, tenantId },
    });
    if (!item) {
      throw new NotFoundException('Item de catálogo não encontrado.');
    }
    return item;
  }

  private async ensureLabelIsAvailable(
    tenantId: string,
    type: CatalogType,
    label: string,
    ignoreId?: string,
  ): Promise<void> {
    const existing = await this.prisma.catalogItem.findUnique({
      where: { tenantId_type_label: { tenantId, type, label } },
    });
    if (existing && existing.id !== ignoreId) {
      throw new ConflictException('Já existe um item com esse nome.');
    }
  }
}
