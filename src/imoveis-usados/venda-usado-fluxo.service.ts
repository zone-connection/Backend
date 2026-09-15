import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  InteresseUsadoStatus,
  UserStatus,
  VendaUsadoHistoricoTipo,
  VendaUsadoNegociacaoOrigem,
  VendaUsadoNegociacaoStatus,
  VendaUsadoPropostaStatus,
  VendaUsadoStatus,
  VendaUsadoVisitaStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { requireTenantId } from '../common/utils/tenant';
import { moneyEqual, toMoneyNumber } from '../captacao/captacao.util';
import {
  CreateNegociacaoMovimentoDto,
  CreatePropostaUsadoDto,
  CreateVisitaUsadoDto,
  FeedbackVisitaUsadoDto,
  UpdatePropostaUsadoDto,
  UpdateVisitaUsadoDto,
} from './dto/venda-usado-fluxo.dto';
import {
  formatBrlHistorico,
  NEGOCIACAO_ORIGEM_LABEL,
  NEGOCIACAO_STATUS_LABEL,
  PROPOSTA_STATUS_LABEL,
  VISITA_INTERESSE_LABEL,
  VISITA_STATUS_LABEL,
} from './venda-usado.matching';

const visitaInclude = {
  interessado: { select: { id: true, nome: true, telefone: true } },
  responsavel: { select: { id: true, name: true } },
} as const;

const propostaInclude = {
  interessado: { select: { id: true, nome: true, telefone: true } },
  responsavel: { select: { id: true, name: true } },
  negociacao: {
    include: {
      movimentos: {
        include: { responsavel: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'asc' as const },
      },
    },
  },
} as const;

@Injectable()
export class VendaUsadoFluxoService {
  constructor(private readonly prisma: PrismaService) {}

  async listVisitas(vendaId: string, user: AuthenticatedUser) {
    const tenantId = requireTenantId(user);
    await this.requireVenda(vendaId, tenantId);
    const rows = await this.prisma.vendaUsadoVisita.findMany({
      where: { vendaUsadoId: vendaId, tenantId },
      include: visitaInclude,
      orderBy: { dataHora: 'desc' },
    });
    return rows.map((row) => this.exposeVisita(row));
  }

  async createVisita(
    vendaId: string,
    dto: CreateVisitaUsadoDto,
    user: AuthenticatedUser,
  ) {
    const tenantId = requireTenantId(user);
    const venda = await this.requireVenda(vendaId, tenantId);
    this.assertComercializavel(venda.status);
    const interessado = await this.requireInteressado(dto.interessadoId, tenantId);
    await this.requireResponsavel(dto.responsavelId, tenantId);
    await this.ensureVinculo(tenantId, vendaId, interessado.id, user);
    const dataHora = this.parseDataHora(dto.dataHora);

    const created = await this.prisma.$transaction(async (tx) => {
      const visita = await tx.vendaUsadoVisita.create({
        data: {
          tenantId,
          vendaUsadoId: vendaId,
          interessadoId: interessado.id,
          responsavelId: dto.responsavelId,
          dataHora,
          observacoes: dto.observacoes?.trim() ?? '',
        },
        include: visitaInclude,
      });
      await tx.vendaUsadoHistorico.create({
        data: {
          tenantId,
          vendaUsadoId: vendaId,
          tipo: VendaUsadoHistoricoTipo.visita,
          texto: `${user.name} agendou visita com ${interessado.nome} em ${this.formatWhen(dataHora)}.`,
          autorId: user.id,
        },
      });
      return visita;
    });
    return this.exposeVisita(created);
  }

  async updateVisita(
    vendaId: string,
    visitaId: string,
    dto: UpdateVisitaUsadoDto,
    user: AuthenticatedUser,
  ) {
    const tenantId = requireTenantId(user);
    const visita = await this.requireVisita(vendaId, visitaId, tenantId);
    if (dto.responsavelId) {
      await this.requireResponsavel(dto.responsavelId, tenantId);
    }
    const nextStatus = dto.status ?? visita.status;
    if (dto.status && dto.status !== visita.status) {
      this.assertVisitaTransicao(visita.status, dto.status);
    }
    const dataHora = dto.dataHora
      ? this.parseDataHora(dto.dataHora)
      : visita.dataHora;

    const historicos: Array<{ tipo: VendaUsadoHistoricoTipo; texto: string }> =
      [];
    if (dto.status && dto.status !== visita.status) {
      historicos.push({
        tipo: VendaUsadoHistoricoTipo.visita,
        texto: `${user.name} alterou a visita de ${visita.interessado.nome}: ${VISITA_STATUS_LABEL[visita.status]} → ${VISITA_STATUS_LABEL[dto.status]}.`,
      });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.vendaUsadoVisita.update({
        where: { id: visitaId },
        data: {
          ...(dto.responsavelId ? { responsavelId: dto.responsavelId } : {}),
          dataHora,
          status: nextStatus,
          ...(dto.observacoes != null
            ? { observacoes: dto.observacoes.trim() }
            : {}),
        },
        include: visitaInclude,
      });
      if (historicos.length) {
        await tx.vendaUsadoHistorico.createMany({
          data: historicos.map((h) => ({
            tenantId,
            vendaUsadoId: vendaId,
            tipo: h.tipo,
            texto: h.texto,
            autorId: user.id,
          })),
        });
      }
      return row;
    });
    return this.exposeVisita(updated);
  }

  async feedbackVisita(
    vendaId: string,
    visitaId: string,
    dto: FeedbackVisitaUsadoDto,
    user: AuthenticatedUser,
  ) {
    const tenantId = requireTenantId(user);
    const visita = await this.requireVisita(vendaId, visitaId, tenantId);
    if (visita.status !== VendaUsadoVisitaStatus.realizada) {
      throw new BadRequestException(
        'O feedback só pode ser registrado após a visita realizada.',
      );
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.vendaUsadoVisita.update({
        where: { id: visitaId },
        data: {
          feedbackAvaliacao: dto.avaliacao,
          feedbackInteresse: dto.interesse,
          feedbackComentarios: dto.comentarios?.trim() ?? '',
          feedbackObservacoes: dto.observacoes?.trim() ?? '',
          feedbackAt: new Date(),
        },
        include: visitaInclude,
      });
      await tx.vendaUsadoHistorico.create({
        data: {
          tenantId,
          vendaUsadoId: vendaId,
          tipo: VendaUsadoHistoricoTipo.visita_feedback,
          texto: `${user.name} registrou feedback da visita de ${visita.interessado.nome}: ${dto.avaliacao}/5 · ${VISITA_INTERESSE_LABEL[dto.interesse]}.`,
          autorId: user.id,
        },
      });
      return row;
    });
    return this.exposeVisita(updated);
  }

  async listPropostas(vendaId: string, user: AuthenticatedUser) {
    const tenantId = requireTenantId(user);
    await this.requireVenda(vendaId, tenantId);
    const rows = await this.prisma.vendaUsadoProposta.findMany({
      where: { vendaUsadoId: vendaId, tenantId },
      include: propostaInclude,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => this.exposeProposta(row));
  }

  async getProposta(vendaId: string, propostaId: string, user: AuthenticatedUser) {
    const tenantId = requireTenantId(user);
    await this.requireVenda(vendaId, tenantId);
    const item = await this.prisma.vendaUsadoProposta.findFirst({
      where: { id: propostaId, vendaUsadoId: vendaId, tenantId },
      include: propostaInclude,
    });
    if (!item) throw new NotFoundException('Proposta não encontrada.');
    return this.exposeProposta(item);
  }

  async createProposta(
    vendaId: string,
    dto: CreatePropostaUsadoDto,
    user: AuthenticatedUser,
  ) {
    const tenantId = requireTenantId(user);
    const venda = await this.requireVenda(vendaId, tenantId);
    this.assertComercializavel(venda.status);
    if (!(dto.valor > 0)) {
      throw new BadRequestException('O valor da proposta deve ser maior que zero.');
    }
    const interessado = await this.requireInteressado(dto.interessadoId, tenantId);
    await this.requireResponsavel(dto.responsavelId, tenantId);
    await this.ensureVinculo(tenantId, vendaId, interessado.id, user);

    const created = await this.prisma.$transaction(async (tx) => {
      const proposta = await tx.vendaUsadoProposta.create({
        data: {
          tenantId,
          vendaUsadoId: vendaId,
          interessadoId: interessado.id,
          responsavelId: dto.responsavelId,
          valor: dto.valor,
          entrada: dto.entrada,
          valorFinanciamento: dto.valorFinanciamento,
          observacoes: dto.observacoes?.trim() ?? '',
        },
      });
      const negociacao = await tx.vendaUsadoNegociacao.create({
        data: {
          tenantId,
          propostaId: proposta.id,
          status: VendaUsadoNegociacaoStatus.aberta,
        },
      });
      await tx.vendaUsadoNegociacaoMovimento.create({
        data: {
          tenantId,
          negociacaoId: negociacao.id,
          valor: dto.valor,
          entrada: dto.entrada,
          valorFinanciamento: dto.valorFinanciamento,
          observacoes: 'Proposta original',
          origem: VendaUsadoNegociacaoOrigem.corretor,
          responsavelId: dto.responsavelId,
        },
      });
      await tx.vendaUsadoHistorico.create({
        data: {
          tenantId,
          vendaUsadoId: vendaId,
          tipo: VendaUsadoHistoricoTipo.proposta,
          texto: `${user.name} criou proposta de ${interessado.nome} no valor de ${formatBrlHistorico(dto.valor)}.`,
          autorId: user.id,
        },
      });
      return proposta.id;
    });
    return this.getProposta(vendaId, created, user);
  }

  async updateProposta(
    vendaId: string,
    propostaId: string,
    dto: UpdatePropostaUsadoDto,
    user: AuthenticatedUser,
  ) {
    const tenantId = requireTenantId(user);
    const current = await this.prisma.vendaUsadoProposta.findFirst({
      where: { id: propostaId, vendaUsadoId: vendaId, tenantId },
      include: { negociacao: true, interessado: { select: { nome: true } } },
    });
    if (!current) throw new NotFoundException('Proposta não encontrada.');

    const historicos: Array<{ tipo: VendaUsadoHistoricoTipo; texto: string }> =
      [];
    let negociacaoStatus: VendaUsadoNegociacaoStatus | undefined;
    if (dto.status && dto.status !== current.status) {
      historicos.push({
        tipo: VendaUsadoHistoricoTipo.proposta,
        texto: `${user.name} alterou a proposta de ${current.interessado.nome}: ${PROPOSTA_STATUS_LABEL[current.status]} → ${PROPOSTA_STATUS_LABEL[dto.status]}.`,
      });
      negociacaoStatus = this.negociacaoFromProposta(dto.status);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.vendaUsadoProposta.update({
        where: { id: propostaId },
        data: {
          ...(dto.status ? { status: dto.status } : {}),
          ...(dto.observacoes != null
            ? { observacoes: dto.observacoes.trim() }
            : {}),
        },
      });
      if (current.negociacao && negociacaoStatus) {
        await tx.vendaUsadoNegociacao.update({
          where: { id: current.negociacao.id },
          data: { status: negociacaoStatus },
        });
      }
      if (historicos.length) {
        await tx.vendaUsadoHistorico.createMany({
          data: historicos.map((h) => ({
            tenantId,
            vendaUsadoId: vendaId,
            tipo: h.tipo,
            texto: h.texto,
            autorId: user.id,
          })),
        });
      }
    });
    return this.getProposta(vendaId, propostaId, user);
  }

  async addMovimento(
    vendaId: string,
    propostaId: string,
    dto: CreateNegociacaoMovimentoDto,
    user: AuthenticatedUser,
  ) {
    const tenantId = requireTenantId(user);
    const proposta = await this.prisma.vendaUsadoProposta.findFirst({
      where: { id: propostaId, vendaUsadoId: vendaId, tenantId },
      include: {
        negociacao: {
          include: {
            movimentos: { orderBy: { createdAt: 'desc' }, take: 1 },
          },
        },
        interessado: { select: { nome: true } },
      },
    });
    if (!proposta) throw new NotFoundException('Proposta não encontrada.');
    if (!proposta.negociacao) {
      throw new BadRequestException('A proposta não possui negociação.');
    }
    const negStatus = proposta.negociacao.status;
    if (
      negStatus === VendaUsadoNegociacaoStatus.aceita ||
      negStatus === VendaUsadoNegociacaoStatus.recusada ||
      negStatus === VendaUsadoNegociacaoStatus.encerrada
    ) {
      throw new BadRequestException(
        'Não é possível alterar valores de uma negociação encerrada.',
      );
    }
    if (
      proposta.status === VendaUsadoPropostaStatus.aceita ||
      proposta.status === VendaUsadoPropostaStatus.recusada ||
      proposta.status === VendaUsadoPropostaStatus.cancelada
    ) {
      throw new BadRequestException(
        'Não é possível negociar uma proposta encerrada.',
      );
    }
    if (!(dto.valor > 0)) {
      throw new BadRequestException('O valor deve ser maior que zero.');
    }
    const responsavelId = dto.responsavelId ?? user.id;
    await this.requireResponsavel(responsavelId, tenantId);
    const anterior = proposta.negociacao.movimentos[0];
    const anteriorValor = toMoneyNumber(anterior?.valor) ?? toMoneyNumber(proposta.valor);
    if (moneyEqual(anteriorValor, dto.valor) && dto.observacoes == null && dto.entrada == null) {
      // still allow same value with different conditions
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.vendaUsadoNegociacaoMovimento.create({
        data: {
          tenantId,
          negociacaoId: proposta.negociacao!.id,
          valor: dto.valor,
          entrada: dto.entrada,
          valorFinanciamento: dto.valorFinanciamento,
          observacoes: dto.observacoes?.trim() ?? '',
          origem: dto.origem ?? VendaUsadoNegociacaoOrigem.corretor,
          responsavelId,
        },
      });
      await tx.vendaUsadoNegociacao.update({
        where: { id: proposta.negociacao!.id },
        data: { status: VendaUsadoNegociacaoStatus.em_negociacao },
      });
      if (
        proposta.status === VendaUsadoPropostaStatus.rascunho ||
        proposta.status === VendaUsadoPropostaStatus.enviada
      ) {
        await tx.vendaUsadoProposta.update({
          where: { id: propostaId },
          data: { status: VendaUsadoPropostaStatus.em_analise },
        });
      }
      await tx.vendaUsadoHistorico.create({
        data: {
          tenantId,
          vendaUsadoId: vendaId,
          tipo: VendaUsadoHistoricoTipo.negociacao,
          texto: `${user.name} registrou contraproposta de ${proposta.interessado.nome}.\nValor anterior:\n${formatBrlHistorico(anteriorValor)}\nNovo valor:\n${formatBrlHistorico(dto.valor)}\nOrigem:\n${NEGOCIACAO_ORIGEM_LABEL[dto.origem ?? 'corretor']}${dto.observacoes ? `\nMotivo:\n${dto.observacoes.trim()}` : ''}`,
          autorId: user.id,
        },
      });
    });
    return this.getProposta(vendaId, propostaId, user);
  }

  private assertComercializavel(status: VendaUsadoStatus) {
    if (
      status === VendaUsadoStatus.indisponivel ||
      status === VendaUsadoStatus.vendido
    ) {
      throw new BadRequestException(
        'Este imóvel não está disponível para comercialização.',
      );
    }
  }

  private assertVisitaTransicao(
    from: VendaUsadoVisitaStatus,
    to: VendaUsadoVisitaStatus,
  ) {
    const allowed: Record<VendaUsadoVisitaStatus, VendaUsadoVisitaStatus[]> = {
      agendada: [
        VendaUsadoVisitaStatus.confirmada,
        VendaUsadoVisitaStatus.realizada,
        VendaUsadoVisitaStatus.cancelada,
        VendaUsadoVisitaStatus.nao_compareceu,
      ],
      confirmada: [
        VendaUsadoVisitaStatus.realizada,
        VendaUsadoVisitaStatus.cancelada,
        VendaUsadoVisitaStatus.nao_compareceu,
        VendaUsadoVisitaStatus.agendada,
      ],
      realizada: [],
      cancelada: [],
      nao_compareceu: [],
    };
    if (from === to) return;
    if (!allowed[from].includes(to)) {
      throw new BadRequestException(
        `Não é possível alterar a visita de ${VISITA_STATUS_LABEL[from]} para ${VISITA_STATUS_LABEL[to]}.`,
      );
    }
  }

  private negociacaoFromProposta(
    status: VendaUsadoPropostaStatus,
  ): VendaUsadoNegociacaoStatus {
    if (status === VendaUsadoPropostaStatus.aceita) {
      return VendaUsadoNegociacaoStatus.aceita;
    }
    if (status === VendaUsadoPropostaStatus.recusada) {
      return VendaUsadoNegociacaoStatus.recusada;
    }
    if (status === VendaUsadoPropostaStatus.cancelada) {
      return VendaUsadoNegociacaoStatus.encerrada;
    }
    if (status === VendaUsadoPropostaStatus.em_analise) {
      return VendaUsadoNegociacaoStatus.em_negociacao;
    }
    return VendaUsadoNegociacaoStatus.aberta;
  }

  private parseDataHora(raw: string) {
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException('Data e horário inválidos.');
    }
    return d;
  }

  private formatWhen(d: Date) {
    return d.toLocaleString('pt-BR');
  }

  private async requireVenda(id: string, tenantId: string) {
    const item = await this.prisma.vendaUsado.findFirst({
      where: { id, tenantId },
      select: { id: true, status: true },
    });
    if (!item) throw new NotFoundException('Venda de usado não encontrada.');
    return item;
  }

  private async requireVisita(
    vendaId: string,
    visitaId: string,
    tenantId: string,
  ) {
    const item = await this.prisma.vendaUsadoVisita.findFirst({
      where: { id: visitaId, vendaUsadoId: vendaId, tenantId },
      include: visitaInclude,
    });
    if (!item) throw new NotFoundException('Visita não encontrada.');
    return item;
  }

  private async requireInteressado(id: string, tenantId: string) {
    const item = await this.prisma.interessadoUsado.findFirst({
      where: { id, tenantId },
    });
    if (!item) {
      throw new BadRequestException(
        'O interessado não pertence a esta imobiliária.',
      );
    }
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

  private async ensureVinculo(
    tenantId: string,
    vendaUsadoId: string,
    interessadoId: string,
    user: AuthenticatedUser,
  ) {
    const exists = await this.prisma.vendaUsadoVinculo.findFirst({
      where: { vendaUsadoId, interessadoId, tenantId },
    });
    if (exists) return exists;
    const interessado = await this.prisma.interessadoUsado.findFirst({
      where: { id: interessadoId, tenantId },
      select: { nome: true },
    });
    return this.prisma.$transaction(async (tx) => {
      const vinculo = await tx.vendaUsadoVinculo.create({
        data: {
          tenantId,
          vendaUsadoId,
          interessadoId,
          interesse: InteresseUsadoStatus.interessado,
        },
      });
      await tx.vendaUsadoHistorico.create({
        data: {
          tenantId,
          vendaUsadoId,
          tipo: VendaUsadoHistoricoTipo.interessado_vinculo,
          texto: `${user.name} vinculou o interessado ${interessado?.nome ?? ''} ao agendar a operação.`,
          autorId: user.id,
        },
      });
      return vinculo;
    });
  }

  private exposeVisita(item: {
    feedbackAvaliacao: number | null;
    [key: string]: unknown;
  }) {
    return item;
  }

  private exposeProposta(item: {
    valor: unknown;
    entrada: unknown;
    valorFinanciamento: unknown;
    negociacao?: {
      status: string;
      movimentos?: Array<{
        valor: unknown;
        entrada: unknown;
        valorFinanciamento: unknown;
        [key: string]: unknown;
      }>;
      [key: string]: unknown;
    } | null;
    [key: string]: unknown;
  }) {
    const movimentos = item.negociacao?.movimentos?.map((m) => ({
      ...m,
      valor: toMoneyNumber(m.valor as never),
      entrada: toMoneyNumber(m.entrada as never),
      valorFinanciamento: toMoneyNumber(m.valorFinanciamento as never),
    }));
    const atual = movimentos?.length
      ? movimentos[movimentos.length - 1]
      : null;
    return {
      ...item,
      valor: toMoneyNumber(item.valor as never),
      entrada: toMoneyNumber(item.entrada as never),
      valorFinanciamento: toMoneyNumber(item.valorFinanciamento as never),
      valorAtual: atual?.valor ?? toMoneyNumber(item.valor as never),
      negociacao: item.negociacao
        ? {
            ...item.negociacao,
            statusLabel:
              NEGOCIACAO_STATUS_LABEL[String(item.negociacao.status)] ??
              item.negociacao.status,
            movimentos,
          }
        : null,
    };
  }
}
