import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  UserStatus,
  VendaUsadoFechamentoStatus,
  VendaUsadoHistoricoTipo,
  VendaUsadoPosVendaPendenciaStatus,
  VendaUsadoPosVendaStatus,
  VendaUsadoStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { requireTenantId } from '../common/utils/tenant';
import {
  CreatePosVendaDto,
  CreatePosVendaPendenciaDto,
  UpdatePosVendaDto,
  UpdatePosVendaPendenciaDto,
} from './dto/venda-usado-pos.dto';
import { POS_VENDA_PENDENCIAS_PADRAO } from './venda-usado-pos.defaults';
import { POS_VENDA_STATUS_LABEL } from './venda-usado.matching';

const posInclude = {
  interessado: { select: { id: true, nome: true } },
  proprietario: { select: { id: true, nome: true } },
  responsavel: { select: { id: true, name: true } },
  pendencias: {
    include: { responsavel: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'asc' as const },
  },
};

@Injectable()
export class VendaUsadoPosVendaService {
  constructor(private readonly prisma: PrismaService) {}

  async get(vendaId: string, user: AuthenticatedUser) {
    const tenantId = requireTenantId(user);
    await this.requireVenda(vendaId, tenantId);
    const row = await this.prisma.vendaUsadoPosVenda.findFirst({
      where: { vendaUsadoId: vendaId, tenantId },
      include: posInclude as never,
    });
    if (!row) throw new NotFoundException('Pós-venda não encontrado.');
    return this.expose(row as never);
  }

  async iniciar(vendaId: string, dto: CreatePosVendaDto, user: AuthenticatedUser) {
    const tenantId = requireTenantId(user);
    const venda = await this.requireVenda(vendaId, tenantId);
    if (venda.status !== VendaUsadoStatus.vendido) {
      throw new BadRequestException(
        'O pós-venda só pode ser iniciado após a venda ser concluída.',
      );
    }
    const fechamento = await this.prisma.vendaUsadoFechamento.findFirst({
      where: {
        vendaUsadoId: vendaId,
        tenantId,
        status: VendaUsadoFechamentoStatus.concluido,
      },
    });
    if (!fechamento) {
      throw new BadRequestException(
        'É necessário um fechamento concluído para iniciar o pós-venda.',
      );
    }

    const existente = await this.prisma.vendaUsadoPosVenda.findFirst({
      where: { vendaUsadoId: vendaId, tenantId },
      include: posInclude as never,
    });
    if (existente && existente.status !== VendaUsadoPosVendaStatus.cancelado) {
      return this.expose(existente as never);
    }

    const imovel = await this.prisma.imovel.findFirst({
      where: { id: venda.imovelId, tenantId },
      select: { proprietarioId: true },
    });
    if (!imovel) throw new NotFoundException('Imóvel não encontrado.');

    const responsavelId = dto.responsavelId ?? user.id;
    await this.requireResponsavel(responsavelId, tenantId);

    const created = await this.prisma.$transaction(async (tx) => {
      const pos = existente
        ? await tx.vendaUsadoPosVenda.update({
            where: { id: existente.id },
            data: {
              interessadoId: fechamento.interessadoId,
              proprietarioId: imovel.proprietarioId,
              responsavelId,
              status: VendaUsadoPosVendaStatus.pendente,
              observacoes: dto.observacoes?.trim() ?? '',
              concluidoAt: null,
              canceladoAt: null,
            },
          })
        : await tx.vendaUsadoPosVenda.create({
            data: {
              tenantId,
              vendaUsadoId: vendaId,
              imovelId: venda.imovelId,
              interessadoId: fechamento.interessadoId,
              proprietarioId: imovel.proprietarioId,
              responsavelId,
              observacoes: dto.observacoes?.trim() ?? '',
            },
          });
      if (existente) {
        await tx.vendaUsadoPosVendaPendencia.deleteMany({
          where: { posVendaId: pos.id, tenantId },
        });
      }
      await tx.vendaUsadoPosVendaPendencia.createMany({
        data: POS_VENDA_PENDENCIAS_PADRAO.map((item) => ({
          tenantId,
          posVendaId: pos.id,
          titulo: item.titulo,
          descricao: item.descricao,
          obrigatoria: item.obrigatoria,
        })),
      });
      await tx.vendaUsadoHistorico.create({
        data: {
          tenantId,
          vendaUsadoId: vendaId,
          tipo: VendaUsadoHistoricoTipo.pos_venda,
          texto: `${user.name} iniciou o pós-venda.`,
          autorId: user.id,
        },
      });
      return tx.vendaUsadoPosVenda.findFirstOrThrow({
        where: { id: pos.id, tenantId },
        include: posInclude as never,
      });
    });
    return this.expose(created as never);
  }

  async update(vendaId: string, dto: UpdatePosVendaDto, user: AuthenticatedUser) {
    const tenantId = requireTenantId(user);
    const pos = await this.requirePos(vendaId, tenantId);
    this.assertAberto(pos.status);

    if (dto.status === VendaUsadoPosVendaStatus.concluido) {
      throw new BadRequestException(
        'Use a ação de concluir pós-venda para encerrar o processo.',
      );
    }
    if (dto.responsavelId) {
      await this.requireResponsavel(dto.responsavelId, tenantId);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.vendaUsadoPosVenda.update({
        where: { id: pos.id },
        data: {
          ...(dto.responsavelId ? { responsavelId: dto.responsavelId } : {}),
          ...(dto.observacoes != null ? { observacoes: dto.observacoes.trim() } : {}),
          ...(dto.status === VendaUsadoPosVendaStatus.cancelado
            ? {
                status: VendaUsadoPosVendaStatus.cancelado,
                canceladoAt: new Date(),
              }
            : dto.status
              ? { status: dto.status }
              : {}),
        },
        include: posInclude as never,
      });
      let texto: string | null = null;
      if (dto.responsavelId && dto.responsavelId !== pos.responsavelId) {
        texto = `${user.name} alterou o responsável do pós-venda.`;
      } else if (dto.status === VendaUsadoPosVendaStatus.cancelado) {
        texto = `${user.name} cancelou o pós-venda.`;
      } else if (dto.status) {
        texto = `${user.name} alterou o status do pós-venda para ${POS_VENDA_STATUS_LABEL[dto.status]}.`;
      }
      if (texto) {
        await tx.vendaUsadoHistorico.create({
          data: {
            tenantId,
            vendaUsadoId: vendaId,
            tipo: VendaUsadoHistoricoTipo.pos_venda,
            texto,
            autorId: user.id,
          },
        });
      }
      return row;
    });
    return this.expose(updated as never);
  }

  async listPendencias(vendaId: string, user: AuthenticatedUser) {
    const pos = await this.get(vendaId, user);
    return pos.pendencias;
  }

  async createPendencia(
    vendaId: string,
    dto: CreatePosVendaPendenciaDto,
    user: AuthenticatedUser,
  ) {
    const tenantId = requireTenantId(user);
    const pos = await this.requirePos(vendaId, tenantId);
    this.assertAberto(pos.status);
    if (dto.responsavelId) {
      await this.requireResponsavel(dto.responsavelId, tenantId);
    }
    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.vendaUsadoPosVendaPendencia.create({
        data: {
          tenantId,
          posVendaId: pos.id,
          titulo: dto.titulo.trim(),
          descricao: dto.descricao?.trim() ?? '',
          obrigatoria: dto.obrigatoria ?? false,
          responsavelId: dto.responsavelId,
          prazo: dto.prazo ? new Date(dto.prazo) : null,
          observacao: dto.observacao?.trim() ?? '',
        },
        include: { responsavel: { select: { id: true, name: true } } },
      });
      if (pos.status === VendaUsadoPosVendaStatus.pendente) {
        await tx.vendaUsadoPosVenda.update({
          where: { id: pos.id },
          data: { status: VendaUsadoPosVendaStatus.em_andamento },
        });
      }
      await tx.vendaUsadoHistorico.create({
        data: {
          tenantId,
          vendaUsadoId: vendaId,
          tipo: VendaUsadoHistoricoTipo.pos_venda,
          texto: `${user.name} criou a pendência "${row.titulo}".`,
          autorId: user.id,
        },
      });
      return row;
    });
    return this.exposePendencia(created);
  }

  async updatePendencia(
    vendaId: string,
    pendenciaId: string,
    dto: UpdatePosVendaPendenciaDto,
    user: AuthenticatedUser,
  ) {
    const tenantId = requireTenantId(user);
    const pos = await this.requirePos(vendaId, tenantId);
    this.assertAberto(pos.status);
    const pendencia = await this.prisma.vendaUsadoPosVendaPendencia.findFirst({
      where: { id: pendenciaId, posVendaId: pos.id, tenantId },
    });
    if (!pendencia) throw new NotFoundException('Pendência não encontrada.');
    if (dto.responsavelId) {
      await this.requireResponsavel(dto.responsavelId, tenantId);
    }

    const next = dto.status ?? pendencia.status;
    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.vendaUsadoPosVendaPendencia.update({
        where: { id: pendencia.id },
        data: {
          ...(dto.titulo ? { titulo: dto.titulo.trim() } : {}),
          ...(dto.descricao != null ? { descricao: dto.descricao.trim() } : {}),
          ...(dto.status ? { status: dto.status } : {}),
          ...(dto.obrigatoria != null ? { obrigatoria: dto.obrigatoria } : {}),
          ...(dto.responsavelId ? { responsavelId: dto.responsavelId } : {}),
          ...(dto.prazo !== undefined
            ? { prazo: dto.prazo ? new Date(dto.prazo) : null }
            : {}),
          ...(dto.observacao != null ? { observacao: dto.observacao.trim() } : {}),
          ...(next === VendaUsadoPosVendaPendenciaStatus.concluida
            ? { concluidaEm: now }
            : {}),
        },
        include: { responsavel: { select: { id: true, name: true } } },
      });
      if (dto.status && dto.status !== pendencia.status) {
        const texto =
          dto.status === VendaUsadoPosVendaPendenciaStatus.concluida
            ? `${user.name} concluiu a pendência "${pendencia.titulo}".`
            : dto.status === VendaUsadoPosVendaPendenciaStatus.cancelada
              ? `${user.name} cancelou a pendência "${pendencia.titulo}".`
              : `${user.name} atualizou a pendência "${pendencia.titulo}".`;
        await tx.vendaUsadoHistorico.create({
          data: {
            tenantId,
            vendaUsadoId: vendaId,
            tipo: VendaUsadoHistoricoTipo.pos_venda,
            texto,
            autorId: user.id,
          },
        });
      }
      await this.syncPosStatus(tx, pos.id, tenantId);
      return row;
    });
    return this.exposePendencia(updated);
  }

  async concluir(vendaId: string, user: AuthenticatedUser) {
    const tenantId = requireTenantId(user);
    const pos = await this.requirePos(vendaId, tenantId);
    this.assertAberto(pos.status);
    const pendencias = await this.prisma.vendaUsadoPosVendaPendencia.findMany({
      where: { posVendaId: pos.id, tenantId },
    });
    const abertas = pendencias.filter(
      (p) =>
        p.obrigatoria &&
        p.status !== VendaUsadoPosVendaPendenciaStatus.concluida &&
        p.status !== VendaUsadoPosVendaPendenciaStatus.cancelada,
    );
    if (abertas.length) {
      throw new BadRequestException(
        'Conclua as pendências obrigatórias antes de encerrar o pós-venda.',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.vendaUsadoPosVenda.update({
        where: { id: pos.id },
        data: {
          status: VendaUsadoPosVendaStatus.concluido,
          concluidoAt: new Date(),
        },
      });
      await tx.vendaUsadoHistorico.create({
        data: {
          tenantId,
          vendaUsadoId: vendaId,
          tipo: VendaUsadoHistoricoTipo.pos_venda,
          texto: `${user.name} concluiu o pós-venda.`,
          autorId: user.id,
        },
      });
    });
    return this.get(vendaId, user);
  }

  private async syncPosStatus(
    tx: Pick<PrismaService, 'vendaUsadoPosVenda' | 'vendaUsadoPosVendaPendencia'>,
    posVendaId: string,
    tenantId: string,
  ) {
    const current = await tx.vendaUsadoPosVenda.findFirst({
      where: { id: posVendaId, tenantId },
      select: { status: true },
    });
    if (
      !current ||
      current.status === VendaUsadoPosVendaStatus.concluido ||
      current.status === VendaUsadoPosVendaStatus.cancelado
    ) {
      return;
    }
    const rows = await tx.vendaUsadoPosVendaPendencia.findMany({
      where: { posVendaId, tenantId },
    });
    const abertas = rows.filter(
      (p) =>
        p.status === VendaUsadoPosVendaPendenciaStatus.pendente ||
        p.status === VendaUsadoPosVendaPendenciaStatus.em_andamento,
    );
    const atrasada = abertas.some(
      (p) => p.prazo && p.prazo.getTime() < Date.now(),
    );
    const status = atrasada
      ? VendaUsadoPosVendaStatus.aguardando_pendencia
      : VendaUsadoPosVendaStatus.em_andamento;
    if (status !== current.status) {
      await tx.vendaUsadoPosVenda.update({
        where: { id: posVendaId },
        data: { status },
      });
    }
  }

  private assertAberto(status: VendaUsadoPosVendaStatus) {
    if (status === VendaUsadoPosVendaStatus.concluido) {
      throw new BadRequestException('O pós-venda já foi concluído.');
    }
    if (status === VendaUsadoPosVendaStatus.cancelado) {
      throw new BadRequestException('O pós-venda está cancelado.');
    }
  }

  private async requireVenda(id: string, tenantId: string) {
    const item = await this.prisma.vendaUsado.findFirst({
      where: { id, tenantId },
      select: { id: true, status: true, imovelId: true },
    });
    if (!item) throw new NotFoundException('Venda de usado não encontrada.');
    return item;
  }

  private async requirePos(vendaId: string, tenantId: string) {
    const item = await this.prisma.vendaUsadoPosVenda.findFirst({
      where: { vendaUsadoId: vendaId, tenantId },
    });
    if (!item) throw new NotFoundException('Pós-venda não encontrado.');
    return item;
  }

  private async requireResponsavel(id: string, tenantId: string) {
    const item = await this.prisma.user.findFirst({
      where: { id, tenantId, status: UserStatus.ativo },
    });
    if (!item) {
      throw new BadRequestException(
        'O responsável deve ser um usuário ativo desta imobiliária.',
      );
    }
    return item;
  }

  private expose(row: {
    id: string;
    status: VendaUsadoPosVendaStatus;
    observacoes: string;
    concluidoAt: Date | null;
    canceladoAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    interessado: { id: string; nome: string };
    proprietario: { id: string; nome: string };
    responsavel: { id: string; name: string };
    pendencias: Array<{
      id: string;
      titulo: string;
      descricao: string;
      status: VendaUsadoPosVendaPendenciaStatus;
      obrigatoria: boolean;
      prazo: Date | null;
      concluidaEm: Date | null;
      observacao: string;
      createdAt: Date;
      updatedAt: Date;
      responsavel?: { id: string; name: string } | null;
    }>;
  }) {
    const abertas = row.pendencias.filter(
      (p) =>
        p.status === VendaUsadoPosVendaPendenciaStatus.pendente ||
        p.status === VendaUsadoPosVendaPendenciaStatus.em_andamento,
    );
    const concluidas = row.pendencias.filter(
      (p) => p.status === VendaUsadoPosVendaPendenciaStatus.concluida,
    );
    return {
      id: row.id,
      status: row.status,
      observacoes: row.observacoes,
      concluidoAt: row.concluidoAt,
      canceladoAt: row.canceladoAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      interessado: row.interessado,
      proprietario: row.proprietario,
      responsavel: row.responsavel,
      pendencias: row.pendencias.map((p) => this.exposePendencia(p)),
      resumo: {
        total: row.pendencias.length,
        concluidas: concluidas.length,
        abertas: abertas.length,
        atrasadas: abertas.filter((p) => p.prazo && p.prazo.getTime() < Date.now())
          .length,
      },
    };
  }

  private exposePendencia(row: {
    id: string;
    titulo: string;
    descricao: string;
    status: VendaUsadoPosVendaPendenciaStatus;
    obrigatoria: boolean;
    prazo: Date | null;
    concluidaEm: Date | null;
    observacao: string;
    createdAt: Date;
    updatedAt?: Date;
    responsavel?: { id: string; name: string } | null;
  }) {
    const atrasada =
      (row.status === VendaUsadoPosVendaPendenciaStatus.pendente ||
        row.status === VendaUsadoPosVendaPendenciaStatus.em_andamento) &&
      !!row.prazo &&
      row.prazo.getTime() < Date.now();
    return {
      id: row.id,
      titulo: row.titulo,
      descricao: row.descricao,
      status: row.status,
      obrigatoria: row.obrigatoria,
      prazo: row.prazo,
      concluidaEm: row.concluidaEm,
      observacao: row.observacao,
      atrasada,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt ?? row.createdAt,
      responsavel: row.responsavel ?? null,
    };
  }
}
