import { Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { requireTenantId } from '../common/utils/tenant';
import { isCorretorLike } from '../common/utils/roles';
import { GERENTE_VER_LEADS_GERAIS_KEY } from '../tenants/tenant-plan';

/**
 * Escopo de dados por equipe, sempre aninhado ao tenant do requester:
 * - admin / analista → todos do tenant
 * - gerente (opção off) → só a própria equipe e carteira
 * - gerente (opção on) → todas as equipes + pool geral
 * - corretor → só o próprio
 */
@Injectable()
export class TeamScopeService {
  constructor(private readonly prisma: PrismaService) {}

  gerenteSeesSharedLeads(requester: AuthenticatedUser): boolean {
    return (
      requester.role === Role.gerente &&
      requester.tenantModules?.[GERENTE_VER_LEADS_GERAIS_KEY] === true
    );
  }

  /** IDs dos corretores visíveis para o requester (null = sem filtro de corretor / admin|analista). */
  async getVisibleCorretorIds(
    requester: AuthenticatedUser,
  ): Promise<string[] | null> {
    const tenantId = requireTenantId(requester);

    if (
      requester.role === Role.admin ||
      requester.role === Role.super_admin ||
      requester.role === Role.analista ||
      this.gerenteSeesSharedLeads(requester)
    ) {
      return null;
    }

    if (isCorretorLike(requester.role)) {
      return [requester.id];
    }

    // gerente restrito → corretores das próprias equipes + o próprio
    const equipes = await this.prisma.equipe.findMany({
      where: { gerenteId: requester.id, tenantId },
      select: {
        membros: {
          where: { role: { in: [Role.corretor, Role.treinee] }, tenantId },
          select: { id: true },
        },
      },
    });

    const membroIds = equipes.flatMap((e) => e.membros.map((m) => m.id));
    return [...new Set([requester.id, ...membroIds])];
  }

  /**
   * Filtro Prisma para leads/documentação baseado na equipe + tenant.
   * Com a opção do admin ligada, o gerente vê o tenant inteiro (outras equipes
   * e pool geral). Desligada, só a própria equipe — sem leads gerais.
   */
  async leadScope(
    requester: AuthenticatedUser,
    options?: { includeAdminPool?: boolean },
  ): Promise<Prisma.LeadWhereInput> {
    const tenantId = requireTenantId(requester);
    const ids = await this.getVisibleCorretorIds(requester);
    if (ids === null) return { tenantId };

    if (requester.role === Role.gerente) {
      const equipes = await this.prisma.equipe.findMany({
        where: { gerenteId: requester.id, tenantId },
        select: { id: true },
      });
      const includeAdminPool =
        options?.includeAdminPool ?? this.gerenteSeesSharedLeads(requester);
      return {
        tenantId,
        OR: [
          { corretorId: { in: ids } },
          ...equipes.map((equipe) => ({
            equipeId: equipe.id,
            corretorId: null as null,
          })),
          ...(includeAdminPool
            ? [{ equipeId: null as null, corretorId: null as null }]
            : []),
        ],
      };
    }

    return { tenantId, corretorId: { in: ids } };
  }

  /** true se o corretor está no escopo do requester. */
  async canAccessCorretor(
    requester: AuthenticatedUser,
    corretorId: string | null | undefined,
    equipeId?: string | null,
  ): Promise<boolean> {
    requireTenantId(requester);
    if (!corretorId) {
      if (
        requester.role === Role.admin ||
        requester.role === Role.super_admin ||
        requester.role === Role.analista ||
        this.gerenteSeesSharedLeads(requester)
      ) {
        return true;
      }
      if (requester.role === Role.gerente) {
        if (!equipeId) return false;
        const equipe = await this.prisma.equipe.findFirst({
          where: {
            id: equipeId,
            gerenteId: requester.id,
            tenantId: requireTenantId(requester),
          },
          select: { id: true },
        });
        return Boolean(equipe);
      }
      return false;
    }
    if (
      (requester.role === Role.admin ||
        requester.role === Role.super_admin ||
        requester.role === Role.gerente) &&
      corretorId === requester.id
    ) {
      return true;
    }
    const ids = await this.getVisibleCorretorIds(requester);
    if (ids === null) return true;
    return ids.includes(corretorId);
  }
}
