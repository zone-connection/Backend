import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  UserStatus,
  VendaUsadoContratoStatus,
  VendaUsadoDocumentoCategoria,
  VendaUsadoDocumentoFornecedor,
  VendaUsadoDocumentoStatus,
  VendaUsadoDocumentoTipo,
  VendaUsadoFechamentoStatus,
  VendaUsadoHistoricoTipo,
  VendaUsadoPropostaStatus,
  VendaUsadoStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { requireTenantId } from '../common/utils/tenant';
import { toMoneyNumber } from '../captacao/captacao.util';
import {
  CreateContratoUsadoDto,
  CreateDocumentoUsadoDto,
  CreateFechamentoUsadoDto,
  UpdateContratoUsadoDto,
  UpdateDocumentoUsadoDto,
  UpdateFechamentoUsadoDto,
} from './dto/venda-usado-fechamento.dto';
import { POS_VENDA_PENDENCIAS_PADRAO } from './venda-usado-pos.defaults';
import {
  CONTRATO_STATUS_LABEL,
  DOCUMENTO_STATUS_LABEL,
  FECHAMENTO_STATUS_LABEL,
  formatBrlHistorico,
} from './venda-usado.matching';

const CHECKLIST_PADRAO: Array<{
  categoria: VendaUsadoDocumentoCategoria;
  tipo: VendaUsadoDocumentoTipo;
  nome: string;
  fornecedor: VendaUsadoDocumentoFornecedor;
  obrigatorio: boolean;
}> = [
  {
    categoria: VendaUsadoDocumentoCategoria.comprador,
    tipo: VendaUsadoDocumentoTipo.identificacao,
    nome: 'Documento de identificação',
    fornecedor: VendaUsadoDocumentoFornecedor.comprador,
    obrigatorio: true,
  },
  {
    categoria: VendaUsadoDocumentoCategoria.comprador,
    tipo: VendaUsadoDocumentoTipo.cpf,
    nome: 'CPF',
    fornecedor: VendaUsadoDocumentoFornecedor.comprador,
    obrigatorio: true,
  },
  {
    categoria: VendaUsadoDocumentoCategoria.comprador,
    tipo: VendaUsadoDocumentoTipo.comprovante_residencia,
    nome: 'Comprovante de residência',
    fornecedor: VendaUsadoDocumentoFornecedor.comprador,
    obrigatorio: true,
  },
  {
    categoria: VendaUsadoDocumentoCategoria.comprador,
    tipo: VendaUsadoDocumentoTipo.complementar,
    nome: 'Documento complementar',
    fornecedor: VendaUsadoDocumentoFornecedor.comprador,
    obrigatorio: false,
  },
  {
    categoria: VendaUsadoDocumentoCategoria.proprietario,
    tipo: VendaUsadoDocumentoTipo.identificacao,
    nome: 'Documento de identificação',
    fornecedor: VendaUsadoDocumentoFornecedor.proprietario,
    obrigatorio: true,
  },
  {
    categoria: VendaUsadoDocumentoCategoria.proprietario,
    tipo: VendaUsadoDocumentoTipo.cpf,
    nome: 'CPF',
    fornecedor: VendaUsadoDocumentoFornecedor.proprietario,
    obrigatorio: true,
  },
  {
    categoria: VendaUsadoDocumentoCategoria.proprietario,
    tipo: VendaUsadoDocumentoTipo.complementar,
    nome: 'Documento complementar',
    fornecedor: VendaUsadoDocumentoFornecedor.proprietario,
    obrigatorio: false,
  },
  {
    categoria: VendaUsadoDocumentoCategoria.imovel,
    tipo: VendaUsadoDocumentoTipo.matricula,
    nome: 'Matrícula',
    fornecedor: VendaUsadoDocumentoFornecedor.imobiliaria,
    obrigatorio: true,
  },
  {
    categoria: VendaUsadoDocumentoCategoria.imovel,
    tipo: VendaUsadoDocumentoTipo.iptu,
    nome: 'IPTU',
    fornecedor: VendaUsadoDocumentoFornecedor.imobiliaria,
    obrigatorio: true,
  },
  {
    categoria: VendaUsadoDocumentoCategoria.imovel,
    tipo: VendaUsadoDocumentoTipo.certidao,
    nome: 'Certidão',
    fornecedor: VendaUsadoDocumentoFornecedor.imobiliaria,
    obrigatorio: true,
  },
  {
    categoria: VendaUsadoDocumentoCategoria.imovel,
    tipo: VendaUsadoDocumentoTipo.complementar,
    nome: 'Documento complementar',
    fornecedor: VendaUsadoDocumentoFornecedor.imobiliaria,
    obrigatorio: false,
  },
  {
    categoria: VendaUsadoDocumentoCategoria.venda,
    tipo: VendaUsadoDocumentoTipo.proposta,
    nome: 'Proposta',
    fornecedor: VendaUsadoDocumentoFornecedor.imobiliaria,
    obrigatorio: true,
  },
  {
    categoria: VendaUsadoDocumentoCategoria.venda,
    tipo: VendaUsadoDocumentoTipo.contrato,
    nome: 'Contrato',
    fornecedor: VendaUsadoDocumentoFornecedor.imobiliaria,
    obrigatorio: true,
  },
  {
    categoria: VendaUsadoDocumentoCategoria.venda,
    tipo: VendaUsadoDocumentoTipo.complementar,
    nome: 'Documento complementar',
    fornecedor: VendaUsadoDocumentoFornecedor.imobiliaria,
    obrigatorio: false,
  },
];

const DOC_TRANSITIONS: Record<
  VendaUsadoDocumentoStatus,
  VendaUsadoDocumentoStatus[]
> = {
  pendente: [VendaUsadoDocumentoStatus.recebido],
  recebido: [VendaUsadoDocumentoStatus.em_analise],
  em_analise: [
    VendaUsadoDocumentoStatus.aprovado,
    VendaUsadoDocumentoStatus.recusado,
  ],
  recusado: [VendaUsadoDocumentoStatus.recebido],
  aprovado: [
    VendaUsadoDocumentoStatus.em_analise,
    VendaUsadoDocumentoStatus.recusado,
  ],
};

const CONTRATO_TRANSITIONS: Record<
  VendaUsadoContratoStatus,
  VendaUsadoContratoStatus[]
> = {
  rascunho: [
    VendaUsadoContratoStatus.em_elaboracao,
    VendaUsadoContratoStatus.cancelado,
  ],
  em_elaboracao: [
    VendaUsadoContratoStatus.enviado,
    VendaUsadoContratoStatus.cancelado,
  ],
  enviado: [
    VendaUsadoContratoStatus.aguardando_assinatura,
    VendaUsadoContratoStatus.cancelado,
  ],
  aguardando_assinatura: [
    VendaUsadoContratoStatus.assinado,
    VendaUsadoContratoStatus.cancelado,
  ],
  assinado: [],
  cancelado: [VendaUsadoContratoStatus.rascunho],
};

const fechamentoInclude = {
  proposta: {
    select: {
      id: true,
      status: true,
      valor: true,
      entrada: true,
      valorFinanciamento: true,
    },
  },
  interessado: { select: { id: true, nome: true, telefone: true } },
  responsavel: { select: { id: true, name: true } },
  documentos: {
    include: { analista: { select: { id: true, name: true } } },
    orderBy: [{ categoria: 'asc' as const }, { createdAt: 'asc' as const }],
  },
  contrato: {
    include: { assinadoPor: { select: { id: true, name: true } } },
  },
};

const DOC_HISTORICO: Partial<Record<VendaUsadoDocumentoStatus, string>> = {
  recebido: 'documento_recebido',
  em_analise: 'documento_em_analise',
  aprovado: 'documento_aprovado',
  recusado: 'documento_recusado',
};

@Injectable()
export class VendaUsadoFechamentoService {
  constructor(private readonly prisma: PrismaService) {}

  async get(vendaId: string, user: AuthenticatedUser) {
    const tenantId = requireTenantId(user);
    await this.requireVenda(vendaId, tenantId);
    const row = await this.prisma.vendaUsadoFechamento.findFirst({
      where: { vendaUsadoId: vendaId, tenantId },
      include: fechamentoInclude,
    });
    if (!row) throw new NotFoundException('Fechamento não encontrado.');
    return this.expose(row as never);
  }

  async iniciar(
    vendaId: string,
    dto: CreateFechamentoUsadoDto,
    user: AuthenticatedUser,
  ) {
    const tenantId = requireTenantId(user);
    const venda = await this.requireVenda(vendaId, tenantId);
    if (venda.status === VendaUsadoStatus.vendido) {
      throw new BadRequestException(
        'Esta venda já foi concluída. Não é possível iniciar um novo fechamento.',
      );
    }

    const existente = await this.prisma.vendaUsadoFechamento.findFirst({
      where: { vendaUsadoId: vendaId, tenantId },
      include: fechamentoInclude,
    });
    if (existente && existente.status !== VendaUsadoFechamentoStatus.cancelado) {
      if (existente.status === VendaUsadoFechamentoStatus.concluido) {
        throw new ConflictException(
          'Esta venda já possui um fechamento concluído.',
        );
      }
      return this.expose(existente as never);
    }

    const proposta = await this.prisma.vendaUsadoProposta.findFirst({
      where: { id: dto.propostaId, vendaUsadoId: vendaId, tenantId },
    });
    if (!proposta) {
      throw new BadRequestException(
        'A proposta não pertence a esta venda nesta imobiliária.',
      );
    }
    if (proposta.status !== VendaUsadoPropostaStatus.aceita) {
      throw new BadRequestException(
        'O fechamento só pode ser iniciado com uma proposta aceita.',
      );
    }

    const interessado = await this.prisma.interessadoUsado.findFirst({
      where: { id: proposta.interessadoId, tenantId },
    });
    if (!interessado) {
      throw new BadRequestException(
        'O interessado não pertence a esta imobiliária.',
      );
    }

    const responsavelId = dto.responsavelId ?? user.id;
    await this.requireResponsavel(responsavelId, tenantId);

    const created = await this.prisma.$transaction(async (tx) => {
      let fechamento;
      if (existente) {
        await tx.vendaUsadoDocumento.deleteMany({
          where: { fechamentoId: existente.id, tenantId },
        });
        await tx.vendaUsadoContrato.deleteMany({
          where: { fechamentoId: existente.id, tenantId },
        });
        fechamento = await tx.vendaUsadoFechamento.update({
          where: { id: existente.id },
          data: {
            propostaId: proposta.id,
            interessadoId: interessado.id,
            responsavelId,
            status: VendaUsadoFechamentoStatus.documentacao_pendente,
            observacoes: dto.observacoes?.trim() ?? '',
            concluidoAt: null,
            canceladoAt: null,
          },
        });
      } else {
        fechamento = await tx.vendaUsadoFechamento.create({
          data: {
            tenantId,
            vendaUsadoId: vendaId,
            propostaId: proposta.id,
            interessadoId: interessado.id,
            responsavelId,
            status: VendaUsadoFechamentoStatus.documentacao_pendente,
            observacoes: dto.observacoes?.trim() ?? '',
          },
        });
      }

      await tx.vendaUsadoDocumento.createMany({
        data: CHECKLIST_PADRAO.map((item) => ({
          tenantId,
          fechamentoId: fechamento.id,
          categoria: item.categoria,
          tipo: item.tipo,
          nome: item.nome,
          fornecedor: item.fornecedor,
          obrigatorio: item.obrigatorio,
        })),
      });

      await tx.vendaUsadoHistorico.create({
        data: {
          tenantId,
          vendaUsadoId: vendaId,
          tipo: VendaUsadoHistoricoTipo.fechamento,
          texto: `${user.name} iniciou o fechamento com a proposta de ${interessado.nome} (${formatBrlHistorico(toMoneyNumber(proposta.valor))}).`,
          autorId: user.id,
        },
      });

      return tx.vendaUsadoFechamento.findFirstOrThrow({
        where: { id: fechamento.id, tenantId },
        include: fechamentoInclude,
      });
    });

    return this.expose(created as never);
  }

  async update(
    vendaId: string,
    dto: UpdateFechamentoUsadoDto,
    user: AuthenticatedUser,
  ) {
    const tenantId = requireTenantId(user);
    const fechamento = await this.requireFechamento(vendaId, tenantId);
    this.assertAberto(fechamento.status);

    if (dto.status && dto.status !== VendaUsadoFechamentoStatus.cancelado) {
      throw new BadRequestException(
        'Use as ações de documentação, contrato ou concluir venda para avançar o fechamento.',
      );
    }

    if (dto.responsavelId) {
      await this.requireResponsavel(dto.responsavelId, tenantId);
    }

    const cancelar = dto.status === VendaUsadoFechamentoStatus.cancelado;
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.vendaUsadoFechamento.update({
        where: { id: fechamento.id },
        data: {
          ...(dto.responsavelId ? { responsavelId: dto.responsavelId } : {}),
          ...(dto.observacoes != null
            ? { observacoes: dto.observacoes.trim() }
            : {}),
          ...(cancelar
            ? {
                status: VendaUsadoFechamentoStatus.cancelado,
                canceladoAt: new Date(),
              }
            : {}),
        },
        include: fechamentoInclude,
      });
      if (cancelar) {
        await tx.vendaUsadoHistorico.create({
          data: {
            tenantId,
            vendaUsadoId: vendaId,
            tipo: VendaUsadoHistoricoTipo.fechamento,
            texto: `${user.name} cancelou o fechamento.`,
            autorId: user.id,
          },
        });
      }
      return row;
    });
    return this.expose(updated as never);
  }

  async listDocumentos(vendaId: string, user: AuthenticatedUser) {
    const fechamento = await this.get(vendaId, user);
    return fechamento.documentos;
  }

  async createDocumento(
    vendaId: string,
    dto: CreateDocumentoUsadoDto,
    user: AuthenticatedUser,
  ) {
    const tenantId = requireTenantId(user);
    const fechamento = await this.requireFechamento(vendaId, tenantId);
    this.assertAberto(fechamento.status);

    const created = await this.prisma.$transaction(async (tx) => {
      const doc = await tx.vendaUsadoDocumento.create({
        data: {
          tenantId,
          fechamentoId: fechamento.id,
          categoria: dto.categoria,
          tipo: dto.tipo,
          nome: dto.nome.trim(),
          fornecedor: dto.fornecedor,
          obrigatorio: dto.obrigatorio ?? dto.tipo !== VendaUsadoDocumentoTipo.complementar,
          observacao: dto.observacao?.trim() ?? '',
        },
        include: { analista: { select: { id: true, name: true } } },
      });
      await tx.vendaUsadoHistorico.create({
        data: {
          tenantId,
          vendaUsadoId: vendaId,
          tipo: VendaUsadoHistoricoTipo.documentacao,
          texto: `${user.name} adicionou o documento "${doc.nome}" ao checklist.`,
          autorId: user.id,
        },
      });
      await this.syncStatus(tx, fechamento.id, tenantId);
      return doc;
    });
    return this.exposeDocumento(created);
  }

  async updateDocumento(
    vendaId: string,
    documentoId: string,
    dto: UpdateDocumentoUsadoDto,
    user: AuthenticatedUser,
  ) {
    const tenantId = requireTenantId(user);
    const fechamento = await this.requireFechamento(vendaId, tenantId);
    this.assertAberto(fechamento.status);

    const doc = await this.prisma.vendaUsadoDocumento.findFirst({
      where: { id: documentoId, fechamentoId: fechamento.id, tenantId },
    });
    if (!doc) throw new NotFoundException('Documento não encontrado.');

    if (dto.status && dto.status !== doc.status) {
      const allowed = DOC_TRANSITIONS[doc.status] ?? [];
      if (!allowed.includes(dto.status)) {
        throw new BadRequestException(
          `Não é possível alterar o documento de ${DOCUMENTO_STATUS_LABEL[doc.status]} para ${DOCUMENTO_STATUS_LABEL[dto.status]}.`,
        );
      }
    }

    if (dto.analistaId) {
      await this.requireResponsavel(dto.analistaId, tenantId);
    }

    const nextStatus = dto.status ?? doc.status;
    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.vendaUsadoDocumento.update({
        where: { id: doc.id },
        data: {
          ...(dto.status ? { status: dto.status } : {}),
          ...(dto.observacao != null ? { observacao: dto.observacao.trim() } : {}),
          ...(dto.analistaId ? { analistaId: dto.analistaId } : {}),
          ...(nextStatus === VendaUsadoDocumentoStatus.recebido &&
          doc.status !== VendaUsadoDocumentoStatus.recebido
            ? { dataRecebimento: now }
            : {}),
          ...(nextStatus === VendaUsadoDocumentoStatus.em_analise ||
          nextStatus === VendaUsadoDocumentoStatus.aprovado ||
          nextStatus === VendaUsadoDocumentoStatus.recusado
            ? {
                dataAnalise: now,
                analistaId: dto.analistaId ?? user.id,
              }
            : {}),
        },
        include: { analista: { select: { id: true, name: true } } },
      });
      if (dto.status && dto.status !== doc.status) {
        const evento = DOC_HISTORICO[dto.status];
        await tx.vendaUsadoHistorico.create({
          data: {
            tenantId,
            vendaUsadoId: vendaId,
            tipo: VendaUsadoHistoricoTipo.documentacao,
            texto: `${user.name} marcou "${doc.nome}" como ${DOCUMENTO_STATUS_LABEL[dto.status]}${evento ? ` (${evento})` : ''}.`,
            autorId: user.id,
          },
        });
      }
      await this.syncStatus(tx, fechamento.id, tenantId);
      return row;
    });
    return this.exposeDocumento(updated);
  }

  async getContrato(vendaId: string, user: AuthenticatedUser) {
    const fechamento = await this.get(vendaId, user);
    if (!fechamento.contrato) {
      throw new NotFoundException('Contrato não encontrado.');
    }
    return fechamento.contrato;
  }

  async createContrato(
    vendaId: string,
    dto: CreateContratoUsadoDto,
    user: AuthenticatedUser,
  ) {
    const tenantId = requireTenantId(user);
    const fechamento = await this.requireFechamento(vendaId, tenantId);
    this.assertAberto(fechamento.status);

    const existente = await this.prisma.vendaUsadoContrato.findFirst({
      where: { fechamentoId: fechamento.id, tenantId },
    });
    if (existente && existente.status !== VendaUsadoContratoStatus.cancelado) {
      const full = await this.prisma.vendaUsadoContrato.findFirstOrThrow({
        where: { id: existente.id },
        include: { assinadoPor: { select: { id: true, name: true } } },
      });
      return this.exposeContrato(full);
    }

    const numero =
      dto.numero?.trim() || (await this.nextNumero(tenantId, existente?.numero));

    const created = await this.prisma.$transaction(async (tx) => {
      const row = existente
        ? await tx.vendaUsadoContrato.update({
            where: { id: existente.id },
            data: {
              numero,
              status: VendaUsadoContratoStatus.rascunho,
              observacoes: dto.observacoes?.trim() ?? '',
              dataCriacao: new Date(),
              dataEnvio: null,
              dataAssinatura: null,
              assinadoPorId: null,
            },
            include: { assinadoPor: { select: { id: true, name: true } } },
          })
        : await tx.vendaUsadoContrato.create({
            data: {
              tenantId,
              fechamentoId: fechamento.id,
              numero,
              observacoes: dto.observacoes?.trim() ?? '',
            },
            include: { assinadoPor: { select: { id: true, name: true } } },
          });
      await tx.vendaUsadoHistorico.create({
        data: {
          tenantId,
          vendaUsadoId: vendaId,
          tipo: VendaUsadoHistoricoTipo.contrato,
          texto: `${user.name} criou o contrato ${row.numero}.`,
          autorId: user.id,
        },
      });
      await this.syncStatus(tx, fechamento.id, tenantId);
      return row;
    });
    return this.exposeContrato(created);
  }

  async updateContrato(
    vendaId: string,
    dto: UpdateContratoUsadoDto,
    user: AuthenticatedUser,
  ) {
    const tenantId = requireTenantId(user);
    const fechamento = await this.requireFechamento(vendaId, tenantId);
    this.assertAberto(fechamento.status);

    const contrato = await this.prisma.vendaUsadoContrato.findFirst({
      where: { fechamentoId: fechamento.id, tenantId },
    });
    if (!contrato) throw new NotFoundException('Contrato não encontrado.');

    if (dto.status && dto.status !== contrato.status) {
      const allowed = CONTRATO_TRANSITIONS[contrato.status] ?? [];
      if (!allowed.includes(dto.status)) {
        throw new BadRequestException(
          `Não é possível alterar o contrato de ${CONTRATO_STATUS_LABEL[contrato.status]} para ${CONTRATO_STATUS_LABEL[dto.status]}.`,
        );
      }
    }

    const next = dto.status ?? contrato.status;
    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.vendaUsadoContrato.update({
        where: { id: contrato.id },
        data: {
          ...(dto.status ? { status: dto.status } : {}),
          ...(dto.observacoes != null
            ? { observacoes: dto.observacoes.trim() }
            : {}),
          ...(next === VendaUsadoContratoStatus.enviado && !contrato.dataEnvio
            ? { dataEnvio: now }
            : {}),
          ...(next === VendaUsadoContratoStatus.assinado
            ? { dataAssinatura: now, assinadoPorId: user.id }
            : {}),
        },
        include: { assinadoPor: { select: { id: true, name: true } } },
      });

      let texto: string | null = null;
      if (dto.status && dto.status !== contrato.status) {
        if (dto.status === VendaUsadoContratoStatus.enviado) {
          texto = `${user.name} enviou o contrato ${contrato.numero}.`;
        } else if (dto.status === VendaUsadoContratoStatus.assinado) {
          texto = `${user.name} registrou a assinatura do contrato ${contrato.numero}.`;
        } else if (dto.status === VendaUsadoContratoStatus.cancelado) {
          texto = `${user.name} cancelou o contrato ${contrato.numero}.`;
        } else {
          texto = `${user.name} atualizou o contrato ${contrato.numero} para ${CONTRATO_STATUS_LABEL[dto.status]}.`;
        }
      } else if (dto.observacoes != null) {
        texto = `${user.name} atualizou o contrato ${contrato.numero}.`;
      }
      if (texto) {
        await tx.vendaUsadoHistorico.create({
          data: {
            tenantId,
            vendaUsadoId: vendaId,
            tipo: VendaUsadoHistoricoTipo.contrato,
            texto,
            autorId: user.id,
          },
        });
      }
      await this.syncStatus(tx, fechamento.id, tenantId);
      return row;
    });
    return this.exposeContrato(updated);
  }

  async concluir(vendaId: string, user: AuthenticatedUser) {
    const tenantId = requireTenantId(user);
    const venda = await this.requireVenda(vendaId, tenantId);
    const fechamento = await this.requireFechamento(vendaId, tenantId);
    if (fechamento.status === VendaUsadoFechamentoStatus.cancelado) {
      throw new BadRequestException('Não é possível concluir um fechamento cancelado.');
    }
    if (fechamento.status === VendaUsadoFechamentoStatus.concluido) {
      throw new ConflictException('Esta venda já foi concluída.');
    }
    if (venda.status === VendaUsadoStatus.vendido) {
      throw new ConflictException('O imóvel já está marcado como vendido.');
    }

    const proposta = await this.prisma.vendaUsadoProposta.findFirst({
      where: { id: fechamento.propostaId, vendaUsadoId: vendaId, tenantId },
    });
    if (!proposta || proposta.status !== VendaUsadoPropostaStatus.aceita) {
      throw new BadRequestException(
        'A proposta vinculada ao fechamento precisa estar aceita.',
      );
    }

    const documentos = await this.prisma.vendaUsadoDocumento.findMany({
      where: { fechamentoId: fechamento.id, tenantId },
    });
    const pendentes = documentos.filter(
      (d) =>
        d.obrigatorio && d.status !== VendaUsadoDocumentoStatus.aprovado,
    );
    if (pendentes.length) {
      throw new BadRequestException(
        'A documentação obrigatória precisa estar aprovada para concluir a venda.',
      );
    }

    const contrato = await this.prisma.vendaUsadoContrato.findFirst({
      where: { fechamentoId: fechamento.id, tenantId },
    });
    if (!contrato) {
      throw new BadRequestException('É necessário criar o contrato para concluir a venda.');
    }
    if (contrato.status !== VendaUsadoContratoStatus.assinado) {
      throw new BadRequestException(
        'O contrato precisa estar assinado para concluir a venda.',
      );
    }

    const outroConcluido = await this.prisma.vendaUsadoFechamento.findFirst({
      where: {
        tenantId,
        status: VendaUsadoFechamentoStatus.concluido,
        vendaUsado: { imovelId: venda.imovelId },
        id: { not: fechamento.id },
      },
    });
    if (outroConcluido) {
      throw new ConflictException(
        'Já existe um fechamento concluído para este imóvel.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.vendaUsadoFechamento.update({
        where: { id: fechamento.id },
        data: {
          status: VendaUsadoFechamentoStatus.concluido,
          concluidoAt: new Date(),
        },
      });
      await tx.vendaUsado.update({
        where: { id: vendaId },
        data: { status: VendaUsadoStatus.vendido },
      });
      await tx.vendaUsadoHistorico.create({
        data: {
          tenantId,
          vendaUsadoId: vendaId,
          tipo: VendaUsadoHistoricoTipo.fechamento,
          texto: `${user.name} concluiu a venda. O imóvel passou a constar como vendido.`,
          autorId: user.id,
        },
      });
      const posExistente = await tx.vendaUsadoPosVenda.findFirst({
        where: { vendaUsadoId: vendaId, tenantId },
      });
      if (!posExistente) {
        const imovel = await tx.imovel.findFirst({
          where: { id: venda.imovelId, tenantId },
          select: { proprietarioId: true },
        });
        if (imovel) {
          const pos = await tx.vendaUsadoPosVenda.create({
            data: {
              tenantId,
              vendaUsadoId: vendaId,
              imovelId: venda.imovelId,
              interessadoId: fechamento.interessadoId,
              proprietarioId: imovel.proprietarioId,
              responsavelId: fechamento.responsavelId ?? user.id,
            },
          });
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
              texto: `${user.name} iniciou o pós-venda automaticamente após a conclusão.`,
              autorId: user.id,
            },
          });
        }
      }
    });

    return this.get(vendaId, user);
  }

  private async nextNumero(tenantId: string, reuse?: string) {
    if (reuse) return reuse;
    const count = await this.prisma.vendaUsadoContrato.count({
      where: { tenantId },
    });
    return `CT-${String(count + 1).padStart(4, '0')}`;
  }

  private async syncStatus(
    tx: Pick<PrismaService, 'vendaUsadoDocumento' | 'vendaUsadoContrato' | 'vendaUsadoFechamento'>,
    fechamentoId: string,
    tenantId: string,
  ) {
    const current = await tx.vendaUsadoFechamento.findFirst({
      where: { id: fechamentoId, tenantId },
      select: { status: true },
    });
    if (
      !current ||
      current.status === VendaUsadoFechamentoStatus.concluido ||
      current.status === VendaUsadoFechamentoStatus.cancelado
    ) {
      return;
    }

    const docs = await tx.vendaUsadoDocumento.findMany({
      where: { fechamentoId, tenantId },
      select: { status: true, obrigatorio: true },
    });
    const contrato = await tx.vendaUsadoContrato.findFirst({
      where: { fechamentoId, tenantId },
      select: { status: true },
    });

    const emAnalise = docs.some(
      (d) => d.status === VendaUsadoDocumentoStatus.em_analise,
    );
    const obrigatoriosOk = docs
      .filter((d) => d.obrigatorio)
      .every((d) => d.status === VendaUsadoDocumentoStatus.aprovado);

    let status: VendaUsadoFechamentoStatus;
    if (!obrigatoriosOk) {
      status = emAnalise
        ? VendaUsadoFechamentoStatus.documentacao_em_analise
        : VendaUsadoFechamentoStatus.documentacao_pendente;
    } else if (!contrato || contrato.status === VendaUsadoContratoStatus.rascunho) {
      status = VendaUsadoFechamentoStatus.contrato_em_elaboracao;
    } else if (contrato.status === VendaUsadoContratoStatus.em_elaboracao) {
      status = VendaUsadoFechamentoStatus.contrato_em_elaboracao;
    } else if (contrato.status === VendaUsadoContratoStatus.enviado) {
      status = VendaUsadoFechamentoStatus.contrato_enviado;
    } else if (
      contrato.status === VendaUsadoContratoStatus.aguardando_assinatura ||
      contrato.status === VendaUsadoContratoStatus.assinado
    ) {
      status = VendaUsadoFechamentoStatus.aguardando_assinatura;
    } else {
      status = VendaUsadoFechamentoStatus.contrato_em_elaboracao;
    }

    if (status !== current.status) {
      await tx.vendaUsadoFechamento.update({
        where: { id: fechamentoId },
        data: { status },
      });
    }
  }

  private assertAberto(status: VendaUsadoFechamentoStatus) {
    if (status === VendaUsadoFechamentoStatus.concluido) {
      throw new BadRequestException('O fechamento já foi concluído.');
    }
    if (status === VendaUsadoFechamentoStatus.cancelado) {
      throw new BadRequestException('O fechamento está cancelado.');
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

  private async requireFechamento(vendaId: string, tenantId: string) {
    const item = await this.prisma.vendaUsadoFechamento.findFirst({
      where: { vendaUsadoId: vendaId, tenantId },
    });
    if (!item) throw new NotFoundException('Fechamento não encontrado.');
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
    status: VendaUsadoFechamentoStatus;
    observacoes: string;
    propostaId: string;
    interessadoId: string;
    responsavelId: string;
    concluidoAt: Date | null;
    canceladoAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    proposta: {
      id: string;
      status: VendaUsadoPropostaStatus;
      valor: unknown;
      entrada: unknown;
      valorFinanciamento: unknown;
    };
    interessado: { id: string; nome: string; telefone: string };
    responsavel: { id: string; name: string };
    documentos: Array<{
      id: string;
      categoria: VendaUsadoDocumentoCategoria;
      tipo: VendaUsadoDocumentoTipo;
      nome: string;
      obrigatorio: boolean;
      fornecedor: VendaUsadoDocumentoFornecedor;
      status: VendaUsadoDocumentoStatus;
      observacao: string;
      dataSolicitacao: Date;
      dataRecebimento: Date | null;
      dataAnalise: Date | null;
      analista?: { id: string; name: string } | null;
    }>;
    contrato: {
      id: string;
      numero: string;
      status: VendaUsadoContratoStatus;
      observacoes: string;
      dataCriacao: Date;
      dataEnvio: Date | null;
      dataAssinatura: Date | null;
      assinadoPor?: { id: string; name: string } | null;
    } | null;
  }) {
    const obrig = row.documentos.filter((d) => d.obrigatorio);
    const aprovados = obrig.filter(
      (d) => d.status === VendaUsadoDocumentoStatus.aprovado,
    );
    return {
      id: row.id,
      status: row.status,
      observacoes: row.observacoes,
      propostaId: row.propostaId,
      interessadoId: row.interessadoId,
      responsavelId: row.responsavelId,
      concluidoAt: row.concluidoAt,
      canceladoAt: row.canceladoAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      proposta: {
        id: row.proposta.id,
        status: row.proposta.status,
        valor: toMoneyNumber(row.proposta.valor as never),
        entrada: toMoneyNumber(row.proposta.entrada as never),
        valorFinanciamento: toMoneyNumber(
          row.proposta.valorFinanciamento as never,
        ),
      },
      interessado: row.interessado,
      responsavel: row.responsavel,
      documentos: row.documentos.map((d) => this.exposeDocumento(d)),
      contrato: row.contrato ? this.exposeContrato(row.contrato) : null,
      documentacao: {
        aprovados: aprovados.length,
        obrigatorios: obrig.length,
        total: row.documentos.length,
      },
    };
  }

  private exposeDocumento(row: {
    id: string;
    categoria: VendaUsadoDocumentoCategoria;
    tipo: VendaUsadoDocumentoTipo;
    nome: string;
    obrigatorio: boolean;
    fornecedor: VendaUsadoDocumentoFornecedor;
    status: VendaUsadoDocumentoStatus;
    observacao: string;
    dataSolicitacao: Date;
    dataRecebimento: Date | null;
    dataAnalise: Date | null;
    analista?: { id: string; name: string } | null;
  }) {
    return {
      id: row.id,
      categoria: row.categoria,
      tipo: row.tipo,
      nome: row.nome,
      obrigatorio: row.obrigatorio,
      fornecedor: row.fornecedor,
      status: row.status,
      observacao: row.observacao,
      dataSolicitacao: row.dataSolicitacao,
      dataRecebimento: row.dataRecebimento,
      dataAnalise: row.dataAnalise,
      analista: row.analista ?? null,
    };
  }

  private exposeContrato(row: {
    id: string;
    numero: string;
    status: VendaUsadoContratoStatus;
    observacoes: string;
    dataCriacao: Date;
    dataEnvio: Date | null;
    dataAssinatura: Date | null;
    assinadoPor?: { id: string; name: string } | null;
  }) {
    return {
      id: row.id,
      numero: row.numero,
      status: row.status,
      observacoes: row.observacoes,
      dataCriacao: row.dataCriacao,
      dataEnvio: row.dataEnvio,
      dataAssinatura: row.dataAssinatura,
      assinadoPor: row.assinadoPor ?? null,
    };
  }
}
