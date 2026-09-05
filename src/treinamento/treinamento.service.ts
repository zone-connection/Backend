import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { requireTenantId } from '../common/utils/tenant';
import { CreateTreinamentoSecaoDto } from './dto/create-secao.dto';
import { UpdateTreinamentoSecaoDto } from './dto/update-secao.dto';
import { CreateTreinamentoLinkDto } from './dto/create-link.dto';
import { UpdateTreinamentoLinkDto } from './dto/update-link.dto';

const MAX_DEPTH = 4;

const linkSelect = {
  id: true,
  secaoId: true,
  titulo: true,
  url: true,
  sortOrder: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.TreinamentoLinkSelect;

const secaoSelect = {
  id: true,
  parentId: true,
  titulo: true,
  sortOrder: true,
  createdAt: true,
  updatedAt: true,
  links: {
    select: linkSelect,
    orderBy: [{ sortOrder: 'asc' }, { titulo: 'asc' }],
  },
} satisfies Prisma.TreinamentoSecaoSelect;

export type TreinamentoSecaoNode = {
  id: string;
  parentId: string | null;
  titulo: string;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  links: {
    id: string;
    secaoId: string;
    titulo: string;
    url: string;
    sortOrder: number;
    createdAt: Date;
    updatedAt: Date;
  }[];
  children: TreinamentoSecaoNode[];
};

@Injectable()
export class TreinamentoService {
  constructor(private readonly prisma: PrismaService) {}

  async tree(requester: AuthenticatedUser): Promise<TreinamentoSecaoNode[]> {
    const tenantId = requireTenantId(requester);
    const secoes = await this.prisma.treinamentoSecao.findMany({
      where: { tenantId },
      select: secaoSelect,
      orderBy: [{ sortOrder: 'asc' }, { titulo: 'asc' }],
    });
    return this.buildTree(secoes);
  }

  async createSecao(
    dto: CreateTreinamentoSecaoDto,
    requester: AuthenticatedUser,
  ) {
    this.assertCanManage(requester);
    const tenantId = requireTenantId(requester);
    const titulo = dto.titulo.trim();
    const parentId = dto.parentId ?? null;

    let sortOrder = 0;
    if (parentId) {
      const parent = await this.prisma.treinamentoSecao.findFirst({
        where: { id: parentId, tenantId },
        select: { id: true },
      });
      if (!parent) throw new NotFoundException('Seção pai não encontrada.');
      const depth = await this.depthOf(parentId, tenantId);
      if (depth >= MAX_DEPTH) {
        throw new BadRequestException(
          `Não é possível criar mais de ${MAX_DEPTH} níveis de seções.`,
        );
      }
      const last = await this.prisma.treinamentoSecao.findFirst({
        where: { tenantId, parentId },
        orderBy: { sortOrder: 'desc' },
        select: { sortOrder: true },
      });
      sortOrder = (last?.sortOrder ?? -1) + 1;
    } else {
      const last = await this.prisma.treinamentoSecao.findFirst({
        where: { tenantId, parentId: null },
        orderBy: { sortOrder: 'desc' },
        select: { sortOrder: true },
      });
      sortOrder = (last?.sortOrder ?? -1) + 1;
    }

    return this.prisma.treinamentoSecao.create({
      data: { tenantId, parentId, titulo, sortOrder },
      select: secaoSelect,
    });
  }

  async updateSecao(
    id: string,
    dto: UpdateTreinamentoSecaoDto,
    requester: AuthenticatedUser,
  ) {
    this.assertCanManage(requester);
    const tenantId = requireTenantId(requester);
    await this.requireSecao(id, tenantId);
    const titulo = dto.titulo?.trim();
    return this.prisma.treinamentoSecao.update({
      where: { id },
      data: titulo ? { titulo } : {},
      select: secaoSelect,
    });
  }

  async removeSecao(id: string, requester: AuthenticatedUser) {
    this.assertCanManage(requester);
    const tenantId = requireTenantId(requester);
    await this.requireSecao(id, tenantId);
    await this.prisma.treinamentoSecao.delete({ where: { id } });
    return { ok: true };
  }

  async createLink(
    dto: CreateTreinamentoLinkDto,
    requester: AuthenticatedUser,
  ) {
    this.assertCanManage(requester);
    const tenantId = requireTenantId(requester);
    await this.requireSecao(dto.secaoId, tenantId);
    const last = await this.prisma.treinamentoLink.findFirst({
      where: { tenantId, secaoId: dto.secaoId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    return this.prisma.treinamentoLink.create({
      data: {
        tenantId,
        secaoId: dto.secaoId,
        titulo: dto.titulo.trim(),
        url: dto.url.trim(),
        sortOrder: (last?.sortOrder ?? -1) + 1,
      },
      select: linkSelect,
    });
  }

  async updateLink(
    id: string,
    dto: UpdateTreinamentoLinkDto,
    requester: AuthenticatedUser,
  ) {
    this.assertCanManage(requester);
    const tenantId = requireTenantId(requester);
    await this.requireLink(id, tenantId);
    return this.prisma.treinamentoLink.update({
      where: { id },
      data: {
        ...(dto.titulo !== undefined ? { titulo: dto.titulo.trim() } : {}),
        ...(dto.url !== undefined ? { url: dto.url.trim() } : {}),
      },
      select: linkSelect,
    });
  }

  async removeLink(id: string, requester: AuthenticatedUser) {
    this.assertCanManage(requester);
    const tenantId = requireTenantId(requester);
    await this.requireLink(id, tenantId);
    await this.prisma.treinamentoLink.delete({ where: { id } });
    return { ok: true };
  }

  private async requireSecao(id: string, tenantId: string) {
    const row = await this.prisma.treinamentoSecao.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!row) throw new NotFoundException('Seção não encontrada.');
    return row;
  }

  private async requireLink(id: string, tenantId: string) {
    const row = await this.prisma.treinamentoLink.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!row) throw new NotFoundException('Link não encontrado.');
    return row;
  }

  private async depthOf(secaoId: string, tenantId: string) {
    let depth = 1;
    let currentId: string | null = secaoId;
    const seen = new Set<string>();
    while (currentId) {
      if (seen.has(currentId)) break;
      seen.add(currentId);
      const parent: { parentId: string | null } | null =
        await this.prisma.treinamentoSecao.findFirst({
          where: { id: currentId, tenantId },
          select: { parentId: true },
        });
      if (!parent?.parentId) break;
      depth += 1;
      currentId = parent.parentId;
    }
    return depth;
  }

  private buildTree(
    secoes: Array<{
      id: string;
      parentId: string | null;
      titulo: string;
      sortOrder: number;
      createdAt: Date;
      updatedAt: Date;
      links: TreinamentoSecaoNode['links'];
    }>,
  ): TreinamentoSecaoNode[] {
    const byParent = new Map<string | null, TreinamentoSecaoNode[]>();
    for (const secao of secoes) {
      const node: TreinamentoSecaoNode = { ...secao, children: [] };
      const key = secao.parentId;
      const list = byParent.get(key) ?? [];
      list.push(node);
      byParent.set(key, list);
    }
    const attach = (parentId: string | null): TreinamentoSecaoNode[] => {
      const nodes = byParent.get(parentId) ?? [];
      for (const node of nodes) {
        node.children = attach(node.id);
      }
      return nodes;
    };
    return attach(null);
  }

  private assertCanManage(requester: AuthenticatedUser) {
    if (
      requester.role !== Role.admin &&
      requester.role !== Role.gerente &&
      requester.role !== Role.analista &&
      requester.role !== Role.treinee
    ) {
      throw new ForbiddenException(
        'Apenas admin, gerente, analista e treinee podem cadastrar o treinamento.',
      );
    }
  }
}
