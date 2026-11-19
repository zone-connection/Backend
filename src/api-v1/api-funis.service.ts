import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ApiFunisService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(tenantId: string) {
    const funis = await this.prisma.funil.findMany({
      where: { tenantId },
      orderBy: [{ tipo: 'asc' }, { ativo: 'desc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        tipo: true,
        ativo: true,
        _count: { select: { etapas: true } },
      },
    });
    return {
      data: funis.map((funil) => ({
        id: funil.id,
        nome: funil.name,
        tipo: funil.tipo,
        ativo: funil.ativo,
        quantidadeEtapas: funil._count.etapas,
      })),
    };
  }

  async detalhe(tenantId: string, id: string) {
    const funil = await this.buscar(tenantId, id);
    return {
      id: funil.id,
      nome: funil.name,
      tipo: funil.tipo,
      ativo: funil.ativo,
      quantidadeEtapas: funil.etapas.length,
      criadoEm: funil.createdAt,
      atualizadoEm: funil.updatedAt,
    };
  }

  async etapas(tenantId: string, id: string) {
    const funil = await this.buscar(tenantId, id);
    return {
      data: funil.etapas.map((etapa) => ({
        id: etapa.id,
        nome: etapa.label,
        slug: etapa.slug,
        ordem: etapa.sortOrder,
        ativo: etapa.active,
        papel: etapa.papel,
        prazoValor: etapa.prazoValor,
        prazoUnidade: etapa.prazoUnidade,
      })),
    };
  }

  private async buscar(tenantId: string, id: string) {
    const funil = await this.prisma.funil.findFirst({
      where: { id, tenantId },
      select: {
        id: true,
        name: true,
        tipo: true,
        ativo: true,
        createdAt: true,
        updatedAt: true,
        etapas: {
          orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
          select: {
            id: true,
            label: true,
            slug: true,
            sortOrder: true,
            active: true,
            papel: true,
            prazoValor: true,
            prazoUnidade: true,
          },
        },
      },
    });
    if (!funil) throw new NotFoundException('Funil não encontrado.');
    return funil;
  }
}
