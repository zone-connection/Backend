import { BadRequestException, Injectable } from '@nestjs/common';
import { FunilTipo } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { missingFunilMessage } from './funil-resolver.messages';

export type ResolveFunilInput = {
  tenantId: string;
  tipo: FunilTipo;
  /** Usuário cuja equipe define o funil (ex.: responsável da operação). */
  userId?: string;
  /** Funil escolhido explicitamente na operação. */
  funilId?: string;
};

@Injectable()
export class FunilResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(input: ResolveFunilInput) {
    const { tenantId, tipo, userId, funilId } = input;

    if (funilId) {
      const explicit = await this.prisma.funil.findFirst({
        where: { id: funilId, tenantId },
        include: { etapas: true },
      });
      if (!explicit) {
        throw new BadRequestException('Funil não encontrado.');
      }
      if (explicit.tipo !== tipo) {
        throw new BadRequestException(
          `O funil informado não é do tipo ${tipo}.`,
        );
      }
      if (!explicit.ativo) {
        throw new BadRequestException(
          'Só é possível usar um funil ativo nesta operação.',
        );
      }
      return explicit;
    }

    if (userId) {
      const equipeId = await this.findEquipeIdForUser(tenantId, userId);
      if (equipeId) {
        const link = await this.prisma.equipeFunil.findUnique({
          where: { equipeId_tipo: { equipeId, tipo } },
          include: { funil: { include: { etapas: true } } },
        });
        if (link?.funil.tenantId === tenantId && link.funil.ativo) {
          return link.funil;
        }
      }
    }

    const fallback = await this.prisma.funil.findFirst({
      where: { tenantId, tipo, ativo: true },
      include: { etapas: true },
    });
    if (!fallback) {
      throw new BadRequestException(missingFunilMessage(tipo));
    }
    return fallback;
  }

  async findEquipeIdForUser(
    tenantId: string,
    userId: string,
  ): Promise<string | null> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId },
      select: {
        equipeId: true,
        equipeGerenciada: { select: { id: true } },
      },
    });
    return user?.equipeId ?? user?.equipeGerenciada?.id ?? null;
  }
}
