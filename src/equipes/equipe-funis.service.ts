import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FunilTipo, Role } from '@prisma/client';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { requireTenantId } from '../common/utils/tenant';
import { PrismaService } from '../prisma/prisma.service';
import { PutEquipeFunisDto } from './dto/put-equipe-funis.dto';

const FUNIL_SUMMARY = {
  id: true,
  name: true,
  tipo: true,
  ativo: true,
} as const;

export type EquipeFunilResumo = {
  id: string;
  name: string;
  tipo: FunilTipo;
  ativo: boolean;
};

export type EquipeFunisMap = Record<
  'comercial' | 'captacao' | 'venda_usados',
  EquipeFunilResumo | null
>;

const EMPTY_FUNIS: EquipeFunisMap = {
  comercial: null,
  captacao: null,
  venda_usados: null,
};

@Injectable()
export class EquipeFunisService {
  constructor(private readonly prisma: PrismaService) {}

  emptyMap(): EquipeFunisMap {
    return { ...EMPTY_FUNIS };
  }

  mapFromRows(
    rows: Array<{
      tipo: FunilTipo;
      funil: EquipeFunilResumo;
    }>,
  ): EquipeFunisMap {
    const out = this.emptyMap();
    for (const row of rows) {
      if (row.tipo === FunilTipo.comercial) out.comercial = row.funil;
      if (row.tipo === FunilTipo.captacao) out.captacao = row.funil;
      if (row.tipo === FunilTipo.venda_usados) out.venda_usados = row.funil;
    }
    return out;
  }

  async getForEquipe(equipeId: string, requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);
    const equipe = await this.prisma.equipe.findFirst({
      where: { id: equipeId, tenantId },
      select: { id: true },
    });
    if (!equipe) throw new NotFoundException('Equipe não encontrada.');
    const rows = await this.prisma.equipeFunil.findMany({
      where: { tenantId, equipeId },
      select: { tipo: true, funil: { select: FUNIL_SUMMARY } },
    });
    return this.mapFromRows(rows);
  }

  async replaceForEquipe(
    equipeId: string,
    dto: PutEquipeFunisDto,
    requester: AuthenticatedUser,
  ) {
    if (requester.role !== Role.admin) {
      throw new ForbiddenException(
        'Somente o administrador pode alterar os funis da equipe.',
      );
    }
    const tenantId = requireTenantId(requester);
    const equipe = await this.prisma.equipe.findFirst({
      where: { id: equipeId, tenantId },
      select: { id: true, tenantId: true },
    });
    if (!equipe) throw new NotFoundException('Equipe não encontrada.');

    const assignments: Array<{
      tipo: FunilTipo;
      funilId: string | null | undefined;
    }> = [
      { tipo: FunilTipo.comercial, funilId: this.normalizeId(dto.comercial) },
      { tipo: FunilTipo.captacao, funilId: this.normalizeId(dto.captacao) },
      {
        tipo: FunilTipo.venda_usados,
        funilId: this.normalizeId(dto.venda_usados),
      },
    ];

    await this.prisma.$transaction(async (tx) => {
      for (const item of assignments) {
        if (item.funilId === undefined) continue;
        if (item.funilId === null) {
          await tx.equipeFunil.deleteMany({
            where: { tenantId, equipeId, tipo: item.tipo },
          });
          continue;
        }
        const funil = await tx.funil.findFirst({
          where: { id: item.funilId, tenantId },
        });
        if (!funil) {
          throw new BadRequestException(
            'O funil não pertence a esta imobiliária.',
          );
        }
        if (funil.tipo !== item.tipo) {
          throw new BadRequestException(
            'O funil selecionado não corresponde ao tipo da operação.',
          );
        }
        if (!funil.ativo) {
          throw new BadRequestException(
            'Só é possível vincular um funil ativo à equipe.',
          );
        }
        await tx.equipeFunil.upsert({
          where: { equipeId_tipo: { equipeId, tipo: item.tipo } },
          create: {
            tenantId,
            equipeId,
            funilId: funil.id,
            tipo: item.tipo,
          },
          update: { funilId: funil.id },
        });
      }
    });

    return this.getForEquipe(equipeId, requester);
  }

  /** undefined = campo omitido; null = remover; string = id. */
  private normalizeId(value: string | null | undefined): string | null | undefined {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;
    return value;
  }
}
