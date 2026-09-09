import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role, UserStatus, ContatoTipo, FunilTipo } from '@prisma/client';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { requireTenantId } from '../common/utils/tenant';
import { isCorretorLike } from '../common/utils/roles';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEquipeDto } from './dto/create-equipe.dto';
import { UpdateEquipeDto } from './dto/update-equipe.dto';
import { EquipeFunisService } from './equipe-funis.service';

const equipeSelect = {
  id: true,
  name: true,
  status: true,
  gerenteId: true,
  createdAt: true,
  updatedAt: true,
  gerente: {
    select: { id: true, name: true, email: true, role: true, status: true },
  },
  membros: {
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
    },
    orderBy: { name: 'asc' as const },
  },
  funis: {
    select: {
      tipo: true,
      funil: { select: { id: true, name: true, tipo: true, ativo: true } },
    },
  },
} satisfies Prisma.EquipeSelect;

@Injectable()
export class EquipesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly equipeFunis: EquipeFunisService,
  ) {}

  private withFunis<
    T extends {
      funis?: Array<{
        tipo: FunilTipo;
        funil: { id: string; name: string; tipo: FunilTipo; ativo: boolean };
      }>;
    },
  >(equipe: T) {
    const { funis, ...rest } = equipe;
    return { ...rest, funis: this.equipeFunis.mapFromRows(funis ?? []) };
  }

  async list(requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);

    // Admin e gerente listam todas as equipes (gerente precisa delas para distribuir).
    const where: Prisma.EquipeWhereInput = { tenantId };

    const equipes = await this.prisma.equipe.findMany({
      where,
      select: equipeSelect,
      orderBy: { name: 'asc' },
    });

    if (equipes.length === 0) return [];

    // Contagem de leads por equipe: pool (equipeId) + atribuídos aos membros.
    const withCounts = await Promise.all(
      equipes.map(async (eq) => {
        const membroIds = eq.membros.map((m) => m.id);
        const [leadsCount, leadsPool] = await Promise.all([
          this.prisma.lead.count({
            where: {
              tenantId,
              tipo: ContatoTipo.lead,
              perdidoAt: null,
              OR: [
                { equipeId: eq.id },
                ...(membroIds.length > 0
                  ? [{ corretorId: { in: membroIds } }]
                  : []),
              ],
            },
          }),
          this.prisma.lead.count({
            where: {
              tenantId,
              tipo: ContatoTipo.lead,
              perdidoAt: null,
              equipeId: eq.id,
              corretorId: null,
            },
          }),
        ]);
        return { ...this.withFunis(eq), leadsCount, leadsPool };
      }),
    );

    return withCounts;
  }

  async findOne(id: string, requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);
    const equipe = await this.prisma.equipe.findFirst({
      where: { id, tenantId },
      select: equipeSelect,
    });
    if (!equipe) {
      throw new NotFoundException('Equipe não encontrada.');
    }
    return this.withFunis(equipe);
  }

  /** Gerentes ativos ainda sem equipe. */
  async listAvailableGerentes(
    requester: AuthenticatedUser,
    excludeEquipeId?: string,
  ) {
    const tenantId = requireTenantId(requester);
    return this.prisma.user.findMany({
      where: {
        tenantId,
        role: Role.gerente,
        status: UserStatus.ativo,
        OR: [
          { equipeGerenciada: null },
          ...(excludeEquipeId
            ? [{ equipeGerenciada: { id: excludeEquipeId } }]
            : []),
        ],
      },
      select: { id: true, name: true, email: true, status: true },
      orderBy: { name: 'asc' },
    });
  }

  /** Corretores ativos livres ou já nesta equipe. */
  async listAvailableCorretores(
    requester: AuthenticatedUser,
    excludeEquipeId?: string,
  ) {
    const tenantId = requireTenantId(requester);
    return this.prisma.user.findMany({
      where: {
        tenantId,
        role: { in: [Role.corretor, Role.treinee] },
        status: UserStatus.ativo,
        OR: [
          { equipeId: null },
          ...(excludeEquipeId ? [{ equipeId: excludeEquipeId }] : []),
        ],
      },
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        equipeId: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  async create(dto: CreateEquipeDto, requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);
    await this.ensureGerenteEligible(tenantId, dto.gerenteId);
    const membroIds = [...new Set(dto.membroIds ?? [])];
    await this.ensureCorretoresEligible(tenantId, membroIds);

    const created = await this.prisma.$transaction(async (tx) => {
      const equipe = await tx.equipe.create({
        data: {
          tenantId,
          name: dto.name.trim(),
          status: dto.status ?? UserStatus.ativo,
          gerenteId: dto.gerenteId,
        },
      });

      if (membroIds.length > 0) {
        await tx.user.updateMany({
          where: { id: { in: membroIds }, tenantId },
          data: { equipeId: equipe.id },
        });
      }

      return tx.equipe.findUniqueOrThrow({
        where: { id: equipe.id },
        select: equipeSelect,
      });
    });
    return this.withFunis(created);
  }

  async update(id: string, dto: UpdateEquipeDto, requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);
    const existing = await this.prisma.equipe.findFirst({
      where: { id, tenantId },
      select: { id: true, gerenteId: true },
    });
    if (!existing) {
      throw new NotFoundException('Equipe não encontrada.');
    }

    if (dto.gerenteId && dto.gerenteId !== existing.gerenteId) {
      await this.ensureGerenteEligible(tenantId, dto.gerenteId, id);
    }

    const membroIds =
      dto.membroIds !== undefined
        ? [...new Set(dto.membroIds)]
        : undefined;
    if (membroIds) {
      await this.ensureCorretoresEligible(tenantId, membroIds, id);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.equipe.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          ...(dto.gerenteId !== undefined
            ? { gerenteId: dto.gerenteId }
            : {}),
        },
      });

      if (membroIds) {
        // Remove quem saiu.
        await tx.user.updateMany({
          where: {
            equipeId: id,
            tenantId,
            id: { notIn: membroIds },
          },
          data: { equipeId: null },
        });
        // Inclui/mantém os informados.
        if (membroIds.length > 0) {
          await tx.user.updateMany({
            where: { id: { in: membroIds }, tenantId },
            data: { equipeId: id },
          });
        }
      }

      return tx.equipe.findUniqueOrThrow({
        where: { id },
        select: equipeSelect,
      });
    });
    return this.withFunis(updated);
  }

  async remove(id: string, requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);
    const existing = await this.prisma.equipe.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Equipe não encontrada.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.user.updateMany({
        where: { equipeId: id, tenantId },
        data: { equipeId: null },
      });
      await tx.equipe.delete({ where: { id } });
    });

    return { ok: true };
  }

  private async ensureGerenteEligible(
    tenantId: string,
    gerenteId: string,
    allowEquipeId?: string,
  ) {
    const user = await this.prisma.user.findFirst({
      where: { id: gerenteId, tenantId },
      select: {
        id: true,
        role: true,
        status: true,
        equipeGerenciada: { select: { id: true } },
      },
    });

    if (!user || user.status !== UserStatus.ativo) {
      throw new BadRequestException('Gerente não encontrado ou inativo.');
    }
    if (user.role !== Role.gerente) {
      throw new BadRequestException(
        'O líder da equipe precisa ter o perfil gerente.',
      );
    }
    if (
      user.equipeGerenciada &&
      user.equipeGerenciada.id !== allowEquipeId
    ) {
      throw new ConflictException('Este gerente já lidera outra equipe.');
    }
  }

  private async ensureCorretoresEligible(
    tenantId: string,
    membroIds: string[],
    allowEquipeId?: string,
  ) {
    if (membroIds.length === 0) return;

    const users = await this.prisma.user.findMany({
      where: { id: { in: membroIds }, tenantId },
      select: {
        id: true,
        role: true,
        status: true,
        equipeId: true,
        name: true,
      },
    });

    if (users.length !== membroIds.length) {
      throw new BadRequestException(
        'Um ou mais corretores informados não existem.',
      );
    }

    for (const u of users) {
      if (!isCorretorLike(u.role)) {
        throw new BadRequestException(
          `"${u.name}" não é corretor/treinee e não pode entrar na equipe.`,
        );
      }
      if (u.status !== UserStatus.ativo) {
        throw new BadRequestException(`"${u.name}" está inativo.`);
      }
      if (u.equipeId && u.equipeId !== allowEquipeId) {
        throw new ConflictException(
          `"${u.name}" já pertence a outra equipe.`,
        );
      }
    }
  }
}
