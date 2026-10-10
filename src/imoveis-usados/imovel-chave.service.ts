import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ImovelChaveLocalizacao,
  ImovelChaveMovimentoTipo,
  ImovelChaveStatus,
  UserStatus,
  VendaUsadoHistoricoTipo,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { requireTenantId } from '../common/utils/tenant';
import {
  CreateImovelChaveDto,
  MovimentarChaveDto,
  UpdateImovelChaveDto,
} from './dto/venda-usado-pos.dto';
import {
  CHAVE_LOCALIZACAO_LABEL,
  CHAVE_STATUS_LABEL,
} from './venda-usado.matching';

const chaveInclude = {
  responsavelAtual: { select: { id: true, name: true } },
} as const;

const movimentoInclude = {
  responsavel: { select: { id: true, name: true } },
} as const;

@Injectable()
export class ImovelChaveService {
  constructor(private readonly prisma: PrismaService) {}

  async list(vendaId: string, user: AuthenticatedUser) {
    const tenantId = requireTenantId(user);
    const venda = await this.requireVenda(vendaId, tenantId);
    const rows = await this.prisma.imovelChave.findMany({
      where: { imovelId: venda.imovelId, tenantId },
      include: chaveInclude,
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) => this.expose(row));
  }

  async create(vendaId: string, dto: CreateImovelChaveDto, user: AuthenticatedUser) {
    const tenantId = requireTenantId(user);
    const venda = await this.requireVenda(vendaId, tenantId);
    const quantidade = dto.quantidade ?? 1;
    if (dto.responsavelAtualId) {
      await this.requireResponsavel(dto.responsavelAtualId, tenantId);
    }
    const created = await this.prisma.$transaction(async (tx) => {
      const chave = await tx.imovelChave.create({
        data: {
          tenantId,
          imovelId: venda.imovelId,
          identificacao: dto.identificacao.trim(),
          quantidade,
          localizacaoAtual: dto.localizacaoAtual ?? ImovelChaveLocalizacao.imobiliaria,
          responsavelAtualId: dto.responsavelAtualId,
          observacoes: dto.observacoes?.trim() ?? '',
        },
        include: chaveInclude,
      });
      await this.writeMovimento(tx, {
        tenantId,
        chaveId: chave.id,
        tipo: ImovelChaveMovimentoTipo.criacao,
        quantidade,
        observacao: dto.observacoes?.trim() ?? '',
        localizacao: chave.localizacaoAtual,
        responsavelId: user.id,
        vendaUsadoId: vendaId,
      });
      await this.writeVendaHistorico(
        tx,
        tenantId,
        vendaId,
        user,
        `${user.name} cadastrou ${quantidade}x "${chave.identificacao}".`,
      );
      return chave;
    });
    return this.expose(created);
  }

  async update(
    vendaId: string,
    chaveId: string,
    dto: UpdateImovelChaveDto,
    user: AuthenticatedUser,
  ) {
    const tenantId = requireTenantId(user);
    const venda = await this.requireVenda(vendaId, tenantId);
    const chave = await this.requireChave(chaveId, venda.imovelId, tenantId);
    if (dto.responsavelAtualId) {
      await this.requireResponsavel(dto.responsavelAtualId, tenantId);
    }
    if (dto.quantidade != null && dto.quantidade < chave.quantidadeRetirada) {
      throw new BadRequestException(
        'A quantidade total não pode ser menor do que as chaves já retiradas.',
      );
    }
    if (
      dto.status === ImovelChaveStatus.disponivel &&
      chave.status === ImovelChaveStatus.perdida
    ) {
      return this.reativar(vendaId, chaveId, user);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.imovelChave.update({
        where: { id: chave.id },
        data: {
          ...(dto.identificacao ? { identificacao: dto.identificacao.trim() } : {}),
          ...(dto.quantidade != null ? { quantidade: dto.quantidade } : {}),
          ...(dto.status ? { status: dto.status } : {}),
          ...(dto.localizacaoAtual ? { localizacaoAtual: dto.localizacaoAtual } : {}),
          ...(dto.responsavelAtualId
            ? { responsavelAtualId: dto.responsavelAtualId }
            : {}),
          ...(dto.observacoes != null ? { observacoes: dto.observacoes.trim() } : {}),
        },
        include: chaveInclude,
      });
      const tipo =
        dto.localizacaoAtual && dto.localizacaoAtual !== chave.localizacaoAtual
          ? ImovelChaveMovimentoTipo.localizacao
          : dto.responsavelAtualId && dto.responsavelAtualId !== chave.responsavelAtualId
            ? ImovelChaveMovimentoTipo.responsavel
            : ImovelChaveMovimentoTipo.edicao;
      await this.writeMovimento(tx, {
        tenantId,
        chaveId: chave.id,
        tipo,
        quantidade: row.quantidade,
        observacao: dto.observacoes?.trim() ?? '',
        localizacao: row.localizacaoAtual,
        responsavelId: user.id,
        vendaUsadoId: vendaId,
      });
      await this.writeVendaHistorico(
        tx,
        tenantId,
        vendaId,
        user,
        `${user.name} atualizou "${row.identificacao}" (${CHAVE_STATUS_LABEL[row.status]}).`,
      );
      return row;
    });
    return this.expose(updated);
  }

  async retirar(
    vendaId: string,
    chaveId: string,
    dto: MovimentarChaveDto,
    user: AuthenticatedUser,
  ) {
    return this.mover(vendaId, chaveId, dto, user, 'retirar');
  }

  async devolver(
    vendaId: string,
    chaveId: string,
    dto: MovimentarChaveDto,
    user: AuthenticatedUser,
  ) {
    return this.mover(vendaId, chaveId, dto, user, 'devolver');
  }

  async entregarComprador(
    vendaId: string,
    chaveId: string,
    dto: MovimentarChaveDto,
    user: AuthenticatedUser,
  ) {
    return this.mover(vendaId, chaveId, dto, user, 'entregar');
  }

  async perder(
    vendaId: string,
    chaveId: string,
    dto: MovimentarChaveDto,
    user: AuthenticatedUser,
  ) {
    const tenantId = requireTenantId(user);
    const venda = await this.requireVenda(vendaId, tenantId);
    const chave = await this.requireChave(chaveId, venda.imovelId, tenantId);
    if (chave.status === ImovelChaveStatus.perdida) {
      throw new BadRequestException('Esta chave já está marcada como perdida.');
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.imovelChave.update({
        where: { id: chave.id },
        data: { status: ImovelChaveStatus.perdida },
        include: chaveInclude,
      });
      await this.writeMovimento(tx, {
        tenantId,
        chaveId: chave.id,
        tipo: ImovelChaveMovimentoTipo.perda,
        quantidade: chave.quantidade,
        observacao: dto.observacao?.trim() ?? '',
        localizacao: chave.localizacaoAtual,
        responsavelId: user.id,
        vendaUsadoId: vendaId,
      });
      await this.writeVendaHistorico(
        tx,
        tenantId,
        vendaId,
        user,
        `${user.name} marcou "${chave.identificacao}" como perdida.`,
      );
      return row;
    });
    return this.expose(updated);
  }

  async historico(vendaId: string, chaveId: string, user: AuthenticatedUser) {
    const tenantId = requireTenantId(user);
    const venda = await this.requireVenda(vendaId, tenantId);
    await this.requireChave(chaveId, venda.imovelId, tenantId);
    const rows = await this.prisma.imovelChaveMovimento.findMany({
      where: { chaveId, tenantId },
      include: movimentoInclude,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => this.exposeMovimento(row));
  }

  private async reativar(vendaId: string, chaveId: string, user: AuthenticatedUser) {
    const tenantId = requireTenantId(user);
    const venda = await this.requireVenda(vendaId, tenantId);
    const chave = await this.requireChave(chaveId, venda.imovelId, tenantId);
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.imovelChave.update({
        where: { id: chave.id },
        data: {
          status: ImovelChaveStatus.disponivel,
          quantidadeRetirada: 0,
          localizacaoAtual: ImovelChaveLocalizacao.imobiliaria,
        },
        include: chaveInclude,
      });
      await this.writeMovimento(tx, {
        tenantId,
        chaveId: chave.id,
        tipo: ImovelChaveMovimentoTipo.reativacao,
        quantidade: chave.quantidade,
        localizacao: ImovelChaveLocalizacao.imobiliaria,
        responsavelId: user.id,
        vendaUsadoId: vendaId,
      });
      await this.writeVendaHistorico(
        tx,
        tenantId,
        vendaId,
        user,
        `${user.name} reativou "${chave.identificacao}".`,
      );
      return row;
    });
    return this.expose(updated);
  }

  private async mover(
    vendaId: string,
    chaveId: string,
    dto: MovimentarChaveDto,
    user: AuthenticatedUser,
    acao: 'retirar' | 'devolver' | 'entregar',
  ) {
    const tenantId = requireTenantId(user);
    const venda = await this.requireVenda(vendaId, tenantId);
    const chave = await this.requireChave(chaveId, venda.imovelId, tenantId);
    if (
      chave.status === ImovelChaveStatus.perdida ||
      chave.status === ImovelChaveStatus.inativa
    ) {
      throw new BadRequestException(
        `Não é possível movimentar uma chave ${CHAVE_STATUS_LABEL[chave.status].toLowerCase()}.`,
      );
    }
    const quantidade = dto.quantidade ?? 1;
    const responsavelId = dto.responsavelId ?? user.id;
    await this.requireResponsavel(responsavelId, tenantId);

    let quantidadeRetirada = chave.quantidadeRetirada;
    let status = chave.status;
    let localizacao = dto.localizacao ?? chave.localizacaoAtual;
    let tipo: ImovelChaveMovimentoTipo;
    let texto: string;

    if (acao === 'devolver') {
      if (quantidade > chave.quantidadeRetirada) {
        throw new BadRequestException(
          'Não há essa quantidade retirada para devolver.',
        );
      }
      quantidadeRetirada -= quantidade;
      status =
        quantidadeRetirada === 0
          ? ImovelChaveStatus.devolvida
          : ImovelChaveStatus.retirada;
      localizacao =
        quantidadeRetirada === 0
          ? ImovelChaveLocalizacao.imobiliaria
          : (dto.localizacao ?? chave.localizacaoAtual);
      tipo = ImovelChaveMovimentoTipo.devolucao;
      texto = `${user.name} devolveu ${quantidade}x "${chave.identificacao}".`;
    } else {
      const disponivel = chave.quantidade - chave.quantidadeRetirada;
      if (acao === 'retirar' && quantidade > disponivel) {
        throw new BadRequestException(
          `Só há ${disponivel} chave(s) disponível(is) para retirada.`,
        );
      }
      if (acao === 'retirar') {
        quantidadeRetirada += quantidade;
      } else if (chave.quantidadeRetirada === 0) {
        if (quantidade > chave.quantidade) {
          throw new BadRequestException(
            'A quantidade entregue não pode exceder o conjunto.',
          );
        }
        quantidadeRetirada = quantidade;
      }
      status = ImovelChaveStatus.retirada;
      localizacao =
        acao === 'entregar'
          ? ImovelChaveLocalizacao.comprador
          : (dto.localizacao ?? ImovelChaveLocalizacao.corretor);
      tipo =
        acao === 'entregar'
          ? ImovelChaveMovimentoTipo.entrega_comprador
          : ImovelChaveMovimentoTipo.retirada;
      texto =
        acao === 'entregar'
          ? `${user.name} registrou a entrega de ${quantidade}x "${chave.identificacao}" ao comprador.`
          : `${user.name} retirou ${quantidade}x "${chave.identificacao}"${dto.motivo ? ` (${dto.motivo})` : ''}.`;
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.imovelChave.update({
        where: { id: chave.id },
        data: {
          quantidadeRetirada,
          status,
          localizacaoAtual: localizacao,
          responsavelAtualId: responsavelId,
        },
        include: chaveInclude,
      });
      await this.writeMovimento(tx, {
        tenantId,
        chaveId: chave.id,
        tipo,
        quantidade,
        motivo: dto.motivo?.trim() ?? '',
        observacao: dto.observacao?.trim() ?? '',
        localizacao,
        responsavelId,
        vendaUsadoId: vendaId,
      });
      await this.writeVendaHistorico(tx, tenantId, vendaId, user, texto);
      return row;
    });
    return this.expose(updated);
  }

  private async writeMovimento(
    tx: Pick<PrismaService, 'imovelChaveMovimento'>,
    data: {
      tenantId: string;
      chaveId: string;
      tipo: ImovelChaveMovimentoTipo;
      quantidade: number;
      motivo?: string;
      observacao?: string;
      localizacao?: ImovelChaveLocalizacao | null;
      responsavelId?: string;
      vendaUsadoId?: string;
    },
  ) {
    await tx.imovelChaveMovimento.create({ data });
  }

  private async writeVendaHistorico(
    tx: Pick<PrismaService, 'vendaUsadoHistorico'>,
    tenantId: string,
    vendaUsadoId: string,
    user: AuthenticatedUser,
    texto: string,
  ) {
    await tx.vendaUsadoHistorico.create({
      data: {
        tenantId,
        vendaUsadoId,
        tipo: VendaUsadoHistoricoTipo.chave,
        texto,
        autorId: user.id,
      },
    });
  }

  private async requireVenda(id: string, tenantId: string) {
    const item = await this.prisma.vendaUsado.findFirst({
      where: { id, tenantId },
      select: { id: true, imovelId: true },
    });
    if (!item) throw new NotFoundException('Venda de usado não encontrada.');
    return item;
  }

  private async requireChave(id: string, imovelId: string, tenantId: string) {
    const item = await this.prisma.imovelChave.findFirst({
      where: { id, imovelId, tenantId },
      include: chaveInclude,
    });
    if (!item) throw new NotFoundException('Chave não encontrada.');
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
    identificacao: string;
    quantidade: number;
    quantidadeRetirada: number;
    status: ImovelChaveStatus;
    localizacaoAtual: ImovelChaveLocalizacao;
    observacoes: string;
    createdAt: Date;
    updatedAt: Date;
    responsavelAtual?: { id: string; name: string } | null;
  }) {
    return {
      id: row.id,
      identificacao: row.identificacao,
      quantidade: row.quantidade,
      quantidadeRetirada: row.quantidadeRetirada,
      status: row.status,
      localizacaoAtual: row.localizacaoAtual,
      observacoes: row.observacoes,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      responsavelAtual: row.responsavelAtual ?? null,
    };
  }

  private exposeMovimento(row: {
    id: string;
    tipo: ImovelChaveMovimentoTipo;
    quantidade: number;
    motivo: string;
    observacao: string;
    localizacao: ImovelChaveLocalizacao | null;
    createdAt: Date;
    responsavel?: { id: string; name: string } | null;
  }) {
    return {
      id: row.id,
      tipo: row.tipo,
      quantidade: row.quantidade,
      motivo: row.motivo,
      observacao: row.observacao,
      localizacao: row.localizacao,
      createdAt: row.createdAt,
      responsavel: row.responsavel ?? null,
    };
  }
}
