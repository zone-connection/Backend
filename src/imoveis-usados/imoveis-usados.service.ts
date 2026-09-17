import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  FunilTipo,
  Prisma,
  UserStatus,
  ImovelChaveStatus,
  VendaUsadoContratoStatus,
  VendaUsadoDocumentoStatus,
  VendaUsadoFechamentoStatus,
  VendaUsadoHistoricoTipo,
  VendaUsadoPosVendaPendenciaStatus,
  VendaUsadoPosVendaStatus,
  VendaUsadoPropostaStatus,
  VendaUsadoStatus,
  VendaUsadoVisitaStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FunilResolverService } from '../funis/funil-resolver.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { requireTenantId } from '../common/utils/tenant';
import {
  pickFirstActiveEtapa,
  moneyEqual,
  toMoneyNumber,
  mergeFunilPorEtapa,
  normalizeComodidades,
} from '../captacao/captacao.util';
import { imovelTitulo } from '../captacao/captacao.constants';
import {
  CreateInteressadoUsadoDto,
  CreateVendaUsadoDto,
  QueryVendasUsadoDto,
  UpdateInteressadoUsadoDto,
  UpdateVendaUsadoDto,
  UpdateVinculoDto,
  VincularInteressadoDto,
} from './dto/imoveis-usados.dto';
import { UpdateImovelDto } from '../captacao/dto/imovel.dto';
import {
  formatBrlHistorico,
  interessadoCompativel,
  INTERESSE_STATUS_LABEL,
  VENDA_STATUS_LABEL,
} from './venda-usado.matching';
import {
  computeOperacaoMonitoramento,
  followUpTiming,
  stageChangeTiming,
} from '../operacao/operacao-monitoramento.util';

const SEM_FUNIL =
  'Não existe um funil de Venda de Usados ativo para este Tenant.';

const vendaInclude = {
  imovel: {
    include: {
      proprietario: { select: { id: true, nome: true, telefone: true } },
      fotos: { orderBy: { sortOrder: 'asc' as const } },
    },
  },
  responsavel: { select: { id: true, name: true, email: true } },
  funil: {
    select: {
      id: true,
      name: true,
      tipo: true,
      inatividadeValor: true,
      inatividadeUnidade: true,
    },
  },
  funilEtapa: {
    select: {
      id: true,
      label: true,
      slug: true,
      color: true,
      papel: true,
      prazoValor: true,
      prazoUnidade: true,
      alertaAntecedenciaPercent: true,
    },
  },
  _count: { select: { vinculos: true } },
} as const;

@Injectable()
export class ImoveisUsadosService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly funilResolver?: FunilResolverService,
  ) {}

  async resumo(user: AuthenticatedUser) {
    const tenantId = requireTenantId(user);
    const [
      disponiveis,
      reservados,
      vendidos,
      interessados,
      visitasAgendadas,
      visitasRealizadas,
      propostasRecebidas,
      propostasEmNegociacao,
      propostasAceitas,
      fechamentosAndamento,
      documentacaoPendente,
      contratosAguardandoAssinatura,
      posVendasAndamento,
      posVendasPendentes,
      pendenciasAtrasadas,
      chavesRetiradas,
      chavesPerdidas,
      porEtapa,
      funil,
    ] = await Promise.all([
      this.prisma.vendaUsado.count({
        where: { tenantId, status: VendaUsadoStatus.disponivel },
      }),
      this.prisma.vendaUsado.count({
        where: { tenantId, status: VendaUsadoStatus.reservado },
      }),
      this.prisma.vendaUsado.count({
        where: { tenantId, status: VendaUsadoStatus.vendido },
      }),
      this.prisma.interessadoUsado.count({ where: { tenantId } }),
      this.prisma.vendaUsadoVisita.count({
        where: {
          tenantId,
          status: { in: [VendaUsadoVisitaStatus.agendada, VendaUsadoVisitaStatus.confirmada] },
        },
      }),
      this.prisma.vendaUsadoVisita.count({
        where: { tenantId, status: VendaUsadoVisitaStatus.realizada },
      }),
      this.prisma.vendaUsadoProposta.count({ where: { tenantId } }),
      this.prisma.vendaUsadoProposta.count({
        where: {
          tenantId,
          status: {
            in: [
              VendaUsadoPropostaStatus.enviada,
              VendaUsadoPropostaStatus.em_analise,
            ],
          },
        },
      }),
      this.prisma.vendaUsadoProposta.count({
        where: { tenantId, status: VendaUsadoPropostaStatus.aceita },
      }),
      this.prisma.vendaUsadoFechamento.count({
        where: {
          tenantId,
          status: {
            notIn: [
              VendaUsadoFechamentoStatus.concluido,
              VendaUsadoFechamentoStatus.cancelado,
            ],
          },
        },
      }),
      this.prisma.vendaUsadoDocumento.count({
        where: {
          tenantId,
          obrigatorio: true,
          status: { not: VendaUsadoDocumentoStatus.aprovado },
          fechamento: {
            status: {
              notIn: [
                VendaUsadoFechamentoStatus.concluido,
                VendaUsadoFechamentoStatus.cancelado,
              ],
            },
          },
        },
      }),
      this.prisma.vendaUsadoContrato.count({
        where: {
          tenantId,
          status: VendaUsadoContratoStatus.aguardando_assinatura,
          fechamento: {
            status: { not: VendaUsadoFechamentoStatus.cancelado },
          },
        },
      }),
      this.prisma.vendaUsadoPosVenda.count({
        where: {
          tenantId,
          status: VendaUsadoPosVendaStatus.em_andamento,
        },
      }),
      this.prisma.vendaUsadoPosVenda.count({
        where: { tenantId, status: VendaUsadoPosVendaStatus.pendente },
      }),
      this.prisma.vendaUsadoPosVendaPendencia.count({
        where: {
          tenantId,
          prazo: { lt: new Date() },
          status: {
            in: [
              VendaUsadoPosVendaPendenciaStatus.pendente,
              VendaUsadoPosVendaPendenciaStatus.em_andamento,
            ],
          },
          posVenda: {
            status: {
              notIn: [
                VendaUsadoPosVendaStatus.concluido,
                VendaUsadoPosVendaStatus.cancelado,
              ],
            },
          },
        },
      }),
      this.prisma.imovelChave.count({
        where: { tenantId, status: ImovelChaveStatus.retirada },
      }),
      this.prisma.imovelChave.count({
        where: { tenantId, status: ImovelChaveStatus.perdida },
      }),
      this.prisma.vendaUsado.groupBy({
        by: ['funilEtapaId'],
        where: { tenantId },
        _count: { _all: true },
      }),
      this.prisma.funil.findFirst({
        where: { tenantId, tipo: FunilTipo.venda_usados, ativo: true },
        include: {
          etapas: {
            where: { active: true },
            orderBy: { sortOrder: 'asc' },
          },
        },
      }),
    ]);
    const etapasAvulsas = funil?.etapas.length
      ? []
      : await this.prisma.funilEtapa.findMany({
          where: { id: { in: porEtapa.map((r) => r.funilEtapaId) } },
          select: {
            id: true,
            label: true,
            papel: true,
            sortOrder: true,
            color: true,
          },
        });
    const porEtapaOut = funil?.etapas.length
      ? mergeFunilPorEtapa(funil.etapas, porEtapa)
      : porEtapa
          .map((row) => {
            const etapa = etapasAvulsas.find((e) => e.id === row.funilEtapaId);
            return {
              funilEtapaId: row.funilEtapaId,
              label: etapa?.label ?? 'Etapa',
              papel: etapa?.papel ?? null,
              color: etapa?.color ?? null,
              sortOrder: etapa?.sortOrder ?? 0,
              total: row._count._all,
            };
          })
          .sort((a, b) => a.sortOrder - b.sortOrder);
    return {
      disponiveis,
      reservados,
      vendidos,
      interessados,
      visitasAgendadas,
      visitasRealizadas,
      propostasRecebidas,
      propostasEmNegociacao,
      propostasAceitas,
      fechamentosAndamento,
      documentacaoPendente,
      contratosAguardandoAssinatura,
      posVendasAndamento,
      posVendasPendentes,
      pendenciasAtrasadas,
      chavesRetiradas,
      chavesPerdidas,
      porEtapa: porEtapaOut,
    };
  }

  listResponsaveis(user: AuthenticatedUser) {
    const tenantId = requireTenantId(user);
    return this.prisma.user.findMany({
      where: { tenantId, status: UserStatus.ativo },
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: 'asc' },
    });
  }

  async listImoveisCaptados(user: AuthenticatedUser) {
    const tenantId = requireTenantId(user);
    const items = await this.prisma.imovel.findMany({
      where: {
        tenantId,
        captacoes: { some: {} },
        vendaUsado: null,
      },
      include: {
        proprietario: { select: { id: true, nome: true } },
        captacoes: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { valorPretendido: true, valorAvaliacao: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
    return items.map((item) => ({
      ...this.exposeImovel(item),
      precoSugerido:
        toMoneyNumber(item.captacoes[0]?.valorAvaliacao) ??
        toMoneyNumber(item.captacoes[0]?.valorPretendido),
    }));
  }

  async list(query: QueryVendasUsadoDto, user: AuthenticatedUser) {
    const tenantId = requireTenantId(user);
    const where: Prisma.VendaUsadoWhereInput = { tenantId };
    if (query.status) where.status = query.status;
    if (query.responsavelId) where.responsavelId = query.responsavelId;
    const imovel: Prisma.ImovelWhereInput = {};
    if (query.tipo) imovel.tipo = query.tipo;
    if (query.cidade) {
      imovel.cidade = { contains: query.cidade, mode: 'insensitive' };
    }
    if (query.bairro) {
      imovel.bairro = { contains: query.bairro, mode: 'insensitive' };
    }
    if (Object.keys(imovel).length) where.imovel = imovel;
    if (query.precoMin != null || query.precoMax != null) {
      where.precoVenda = {};
      if (query.precoMin != null) where.precoVenda.gte = query.precoMin;
      if (query.precoMax != null) where.precoVenda.lte = query.precoMax;
    }
    const items = await this.prisma.vendaUsado.findMany({
      where,
      include: vendaInclude,
      orderBy: { updatedAt: 'desc' },
    });
    return items.map((item) => this.exposeVenda(item));
  }

  async get(id: string, user: AuthenticatedUser) {
    const tenantId = requireTenantId(user);
    const item = await this.prisma.vendaUsado.findFirst({
      where: { id, tenantId },
      include: {
        ...vendaInclude,
        vinculos: {
          include: { interessado: true },
          orderBy: { createdAt: 'desc' },
        },
        historicos: {
          include: { autor: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!item) throw new NotFoundException('Venda de usado não encontrada.');
    return this.exposeVenda(item);
  }

  async updateImovelFicha(
    vendaId: string,
    dto: UpdateImovelDto,
    user: AuthenticatedUser,
  ) {
    const tenantId = requireTenantId(user);
    const venda = await this.prisma.vendaUsado.findFirst({
      where: { id: vendaId, tenantId },
      select: { id: true, imovelId: true },
    });
    if (!venda) throw new NotFoundException('Venda de usado não encontrada.');
    await this.prisma.imovel.update({
      where: { id: venda.imovelId },
      data: {
        ...(dto.tipo ? { tipo: dto.tipo } : {}),
        ...(dto.cep != null ? { cep: dto.cep.trim() } : {}),
        ...(dto.logradouro != null ? { logradouro: dto.logradouro.trim() } : {}),
        ...(dto.numero != null ? { numero: dto.numero.trim() } : {}),
        ...(dto.complemento != null
          ? { complemento: dto.complemento.trim() }
          : {}),
        ...(dto.bairro != null ? { bairro: dto.bairro.trim() } : {}),
        ...(dto.cidade != null ? { cidade: dto.cidade.trim() } : {}),
        ...(dto.estado != null
          ? { estado: dto.estado.trim().toUpperCase() }
          : {}),
        ...(dto.area !== undefined ? { area: dto.area } : {}),
        ...(dto.areaConstruida !== undefined
          ? { areaConstruida: dto.areaConstruida }
          : {}),
        ...(dto.quartos !== undefined ? { quartos: dto.quartos } : {}),
        ...(dto.suites !== undefined ? { suites: dto.suites } : {}),
        ...(dto.banheiros !== undefined ? { banheiros: dto.banheiros } : {}),
        ...(dto.vagas !== undefined ? { vagas: dto.vagas } : {}),
        ...(dto.tipoEmpreendimento != null
          ? { tipoEmpreendimento: dto.tipoEmpreendimento.trim() }
          : {}),
        ...(dto.aptsPorAndar !== undefined
          ? { aptsPorAndar: dto.aptsPorAndar }
          : {}),
        ...(dto.andares !== undefined ? { andares: dto.andares } : {}),
        ...(dto.torres !== undefined ? { torres: dto.torres } : {}),
        ...(dto.descricao != null ? { descricao: dto.descricao.trim() } : {}),
        ...(dto.comodidadesUnidade !== undefined
          ? { comodidadesUnidade: normalizeComodidades(dto.comodidadesUnidade) }
          : {}),
        ...(dto.comodidadesCondominio !== undefined
          ? {
              comodidadesCondominio: normalizeComodidades(
                dto.comodidadesCondominio,
              ),
            }
          : {}),
        ...(dto.observacoes != null
          ? { observacoes: dto.observacoes.trim() }
          : {}),
      },
    });
    return this.get(vendaId, user);
  }

  async create(dto: CreateVendaUsadoDto, user: AuthenticatedUser) {
    const tenantId = requireTenantId(user);
    const imovel = await this.prisma.imovel.findFirst({
      where: { id: dto.imovelId, tenantId },
      include: {
        captacoes: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { valorPretendido: true, valorAvaliacao: true },
        },
        vendaUsado: { select: { id: true } },
      },
    });
    if (!imovel) {
      throw new BadRequestException('O imóvel não pertence a esta imobiliária.');
    }
    if (!imovel.captacoes.length) {
      throw new BadRequestException(
        'Só é possível disponibilizar um imóvel que já tenha captação.',
      );
    }
    if (imovel.vendaUsado) {
      throw new ConflictException('Este imóvel já está na venda de usados.');
    }
    await this.requireResponsavel(dto.responsavelId, tenantId);
    const funil = await this.resolveFunil(
      tenantId,
      dto.funilId,
      dto.responsavelId,
    );
    const etapa = pickFirstActiveEtapa(funil.etapas);
    if (!etapa) {
      throw new BadRequestException(
        'O funil de Venda de Usados ativo não possui etapas.',
      );
    }
    const preco =
      dto.precoVenda ??
      toMoneyNumber(imovel.captacoes[0]?.valorAvaliacao) ??
      toMoneyNumber(imovel.captacoes[0]?.valorPretendido);

    const created = await this.prisma.$transaction(async (tx) => {
      const venda = await tx.vendaUsado.create({
        data: {
          tenantId,
          imovelId: dto.imovelId,
          responsavelId: dto.responsavelId,
          funilId: funil.id,
          funilEtapaId: etapa.id,
          precoVenda: preco,
          ...stageChangeTiming(new Date(), etapa),
          observacoes: dto.observacoes?.trim() ?? '',
        },
      });
      await tx.vendaUsadoHistorico.create({
        data: {
          tenantId,
          vendaUsadoId: venda.id,
          tipo: VendaUsadoHistoricoTipo.disponibilizacao,
          texto: `${user.name} disponibilizou o imóvel para venda.`,
          autorId: user.id,
        },
      });
      return venda;
    });
    return this.get(created.id, user);
  }

  async update(id: string, dto: UpdateVendaUsadoDto, user: AuthenticatedUser) {
    const tenantId = requireTenantId(user);
    const current = await this.prisma.vendaUsado.findFirst({
      where: { id, tenantId },
      include: { funil: { include: { etapas: true } }, funilEtapa: true },
    });
    if (!current) throw new NotFoundException('Venda de usado não encontrada.');
    if (dto.responsavelId) {
      await this.requireResponsavel(dto.responsavelId, tenantId);
    }
    let nextEtapaId = current.funilEtapaId;
    let nextEtapaLabel = current.funilEtapa.label;
    if (dto.funilEtapaId && dto.funilEtapaId !== current.funilEtapaId) {
      const etapa = current.funil.etapas.find((e) => e.id === dto.funilEtapaId);
      if (!etapa) {
        throw new BadRequestException(
          'A etapa não pertence ao funil de Venda de Usados.',
        );
      }
      nextEtapaId = etapa.id;
      nextEtapaLabel = etapa.label;
    }

    const historicos: Array<{
      tipo: VendaUsadoHistoricoTipo;
      texto: string;
    }> = [];
    if (dto.responsavelId && dto.responsavelId !== current.responsavelId) {
      const novo = await this.prisma.user.findFirst({
        where: { id: dto.responsavelId, tenantId },
        select: { name: true },
      });
      historicos.push({
        tipo: VendaUsadoHistoricoTipo.responsavel,
        texto: `${novo?.name ?? user.name} assumiu a venda.`,
      });
    }
    if (dto.status && dto.status !== current.status) {
      historicos.push({
        tipo: VendaUsadoHistoricoTipo.status,
        texto: `Status alterado: ${VENDA_STATUS_LABEL[current.status]} → ${VENDA_STATUS_LABEL[dto.status]}.`,
      });
    }
    if (
      dto.precoVenda !== undefined &&
      !moneyEqual(toMoneyNumber(current.precoVenda), dto.precoVenda)
    ) {
      historicos.push({
        tipo: VendaUsadoHistoricoTipo.preco,
        texto: `Preço alterado\nAnterior:\n${formatBrlHistorico(toMoneyNumber(current.precoVenda))}\nNovo:\n${formatBrlHistorico(dto.precoVenda)}`,
      });
    }
    if (dto.funilEtapaId && dto.funilEtapaId !== current.funilEtapaId) {
      historicos.push({
        tipo: VendaUsadoHistoricoTipo.etapa,
        texto: `${user.name} alterou:\n${current.funilEtapa.label} → ${nextEtapaLabel}`,
      });
    }

    const etapaChanged = Boolean(
      dto.funilEtapaId && dto.funilEtapaId !== current.funilEtapaId,
    );
    const nextEtapa =
      current.funil.etapas.find((e) => e.id === nextEtapaId) ??
      current.funilEtapa;
    const now = new Date();
    const timing = etapaChanged
      ? stageChangeTiming(now, nextEtapa)
      : historicos.length
        ? followUpTiming(now, nextEtapa)
        : {};

    await this.prisma.$transaction(async (tx) => {
      await tx.vendaUsado.update({
        where: { id },
        data: {
          ...(dto.responsavelId ? { responsavelId: dto.responsavelId } : {}),
          ...(dto.status ? { status: dto.status } : {}),
          ...(dto.precoVenda !== undefined ? { precoVenda: dto.precoVenda } : {}),
          ...(dto.observacoes != null
            ? { observacoes: dto.observacoes.trim() }
            : {}),
          funilEtapaId: nextEtapaId,
          ...timing,
        },
      });
      if (historicos.length) {
        await tx.vendaUsadoHistorico.createMany({
          data: historicos.map((h) => ({
            tenantId,
            vendaUsadoId: id,
            tipo: h.tipo,
            texto: h.texto,
            autorId: user.id,
          })),
        });
      }
    });
    return this.get(id, user);
  }

  listInteressados(user: AuthenticatedUser) {
    const tenantId = requireTenantId(user);
    return this.prisma.interessadoUsado.findMany({
      where: { tenantId },
      orderBy: { nome: 'asc' },
    }).then((rows) => rows.map((row) => this.exposeInteressado(row)));
  }

  async getInteressado(id: string, user: AuthenticatedUser) {
    const tenantId = requireTenantId(user);
    const item = await this.prisma.interessadoUsado.findFirst({
      where: { id, tenantId },
    });
    if (!item) throw new NotFoundException('Interessado não encontrado.');
    return this.exposeInteressado(item);
  }

  async createInteressado(dto: CreateInteressadoUsadoDto, user: AuthenticatedUser) {
    const tenantId = requireTenantId(user);
    const created = await this.prisma.interessadoUsado.create({
      data: {
        tenantId,
        nome: dto.nome.trim(),
        telefone: dto.telefone?.trim() ?? '',
        email: dto.email?.trim() ?? '',
        observacoes: dto.observacoes?.trim() ?? '',
        tipoDesejado: dto.tipoDesejado,
        cidade: dto.cidade?.trim() ?? '',
        bairros: dto.bairros?.trim() ?? '',
        precoMin: dto.precoMin,
        precoMax: dto.precoMax,
        quartosMin: dto.quartosMin,
        banheirosMin: dto.banheirosMin,
        vagasMin: dto.vagasMin,
        areaMin: dto.areaMin,
      },
    });
    return this.exposeInteressado(created);
  }

  async updateInteressado(
    id: string,
    dto: UpdateInteressadoUsadoDto,
    user: AuthenticatedUser,
  ) {
    await this.getInteressado(id, user);
    const updated = await this.prisma.interessadoUsado.update({
      where: { id },
      data: {
        ...(dto.nome != null ? { nome: dto.nome.trim() } : {}),
        ...(dto.telefone != null ? { telefone: dto.telefone.trim() } : {}),
        ...(dto.email != null ? { email: dto.email.trim() } : {}),
        ...(dto.observacoes != null ? { observacoes: dto.observacoes.trim() } : {}),
        ...(dto.tipoDesejado !== undefined ? { tipoDesejado: dto.tipoDesejado } : {}),
        ...(dto.cidade != null ? { cidade: dto.cidade.trim() } : {}),
        ...(dto.bairros != null ? { bairros: dto.bairros.trim() } : {}),
        ...(dto.precoMin !== undefined ? { precoMin: dto.precoMin } : {}),
        ...(dto.precoMax !== undefined ? { precoMax: dto.precoMax } : {}),
        ...(dto.quartosMin !== undefined ? { quartosMin: dto.quartosMin } : {}),
        ...(dto.banheirosMin !== undefined
          ? { banheirosMin: dto.banheirosMin }
          : {}),
        ...(dto.vagasMin !== undefined ? { vagasMin: dto.vagasMin } : {}),
        ...(dto.areaMin !== undefined ? { areaMin: dto.areaMin } : {}),
      },
    });
    return this.exposeInteressado(updated);
  }

  async listVinculos(vendaId: string, user: AuthenticatedUser) {
    const venda = await this.get(vendaId, user);
    return venda.vinculos ?? [];
  }

  async matching(vendaId: string, user: AuthenticatedUser) {
    const tenantId = requireTenantId(user);
    const venda = await this.prisma.vendaUsado.findFirst({
      where: { id: vendaId, tenantId },
      include: { imovel: true, vinculos: { select: { interessadoId: true } } },
    });
    if (!venda) throw new NotFoundException('Venda de usado não encontrada.');
    const linked = new Set(venda.vinculos.map((v) => v.interessadoId));
    const all = await this.prisma.interessadoUsado.findMany({
      where: { tenantId },
    });
    const imovel = {
      tipo: venda.imovel.tipo,
      cidade: venda.imovel.cidade,
      bairro: venda.imovel.bairro,
      quartos: venda.imovel.quartos,
      banheiros: venda.imovel.banheiros,
      vagas: venda.imovel.vagas,
      area: toMoneyNumber(venda.imovel.area),
      preco: toMoneyNumber(venda.precoVenda),
    };
    return all
      .filter((i) => !linked.has(i.id))
      .filter((i) =>
        interessadoCompativel(imovel, {
          tipoDesejado: i.tipoDesejado,
          cidade: i.cidade,
          bairros: i.bairros,
          precoMin: toMoneyNumber(i.precoMin),
          precoMax: toMoneyNumber(i.precoMax),
          quartosMin: i.quartosMin,
          banheirosMin: i.banheirosMin,
          vagasMin: i.vagasMin,
          areaMin: toMoneyNumber(i.areaMin),
        }),
      )
      .map((i) => this.exposeInteressado(i));
  }

  async vincular(
    vendaId: string,
    dto: VincularInteressadoDto,
    user: AuthenticatedUser,
  ) {
    const tenantId = requireTenantId(user);
    await this.get(vendaId, user);
    const interessado = await this.prisma.interessadoUsado.findFirst({
      where: { id: dto.interessadoId, tenantId },
    });
    if (!interessado) {
      throw new BadRequestException(
        'O interessado não pertence a esta imobiliária.',
      );
    }
    const exists = await this.prisma.vendaUsadoVinculo.findFirst({
      where: { vendaUsadoId: vendaId, interessadoId: dto.interessadoId },
    });
    if (exists) {
      throw new ConflictException('Este interessado já está vinculado ao imóvel.');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.vendaUsadoVinculo.create({
        data: {
          tenantId,
          vendaUsadoId: vendaId,
          interessadoId: dto.interessadoId,
          interesse: dto.interesse,
          observacoes: dto.observacoes?.trim() ?? '',
        },
      });
      await tx.vendaUsadoHistorico.create({
        data: {
          tenantId,
          vendaUsadoId: vendaId,
          tipo: VendaUsadoHistoricoTipo.interessado_vinculo,
          texto: `${user.name} vinculou o interessado ${interessado.nome}.`,
          autorId: user.id,
        },
      });
    });
    return this.get(vendaId, user);
  }

  async atualizarVinculo(
    vendaId: string,
    vinculoId: string,
    dto: UpdateVinculoDto,
    user: AuthenticatedUser,
  ) {
    const tenantId = requireTenantId(user);
    const vinculo = await this.prisma.vendaUsadoVinculo.findFirst({
      where: { id: vinculoId, vendaUsadoId: vendaId, tenantId },
      include: { interessado: { select: { nome: true } } },
    });
    if (!vinculo) throw new NotFoundException('Vínculo não encontrado.');
    const historicos: Array<{ tipo: VendaUsadoHistoricoTipo; texto: string }> =
      [];
    if (dto.interesse && dto.interesse !== vinculo.interesse) {
      historicos.push({
        tipo: VendaUsadoHistoricoTipo.edicao,
        texto: `Interesse de ${vinculo.interessado.nome}: ${INTERESSE_STATUS_LABEL[vinculo.interesse]} → ${INTERESSE_STATUS_LABEL[dto.interesse]}.`,
      });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.vendaUsadoVinculo.update({
        where: { id: vinculoId },
        data: {
          ...(dto.interesse ? { interesse: dto.interesse } : {}),
          ...(dto.observacoes != null
            ? { observacoes: dto.observacoes.trim() }
            : {}),
        },
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
    });
    return this.get(vendaId, user);
  }

  async removerVinculo(vendaId: string, vinculoId: string, user: AuthenticatedUser) {
    const tenantId = requireTenantId(user);
    const vinculo = await this.prisma.vendaUsadoVinculo.findFirst({
      where: { id: vinculoId, vendaUsadoId: vendaId, tenantId },
      include: { interessado: { select: { nome: true } } },
    });
    if (!vinculo) throw new NotFoundException('Vínculo não encontrado.');
    await this.prisma.$transaction(async (tx) => {
      await tx.vendaUsadoVinculo.delete({ where: { id: vinculoId } });
      await tx.vendaUsadoHistorico.create({
        data: {
          tenantId,
          vendaUsadoId: vendaId,
          tipo: VendaUsadoHistoricoTipo.interessado_remocao,
          texto: `${user.name} removeu o interessado ${vinculo.interessado.nome}.`,
          autorId: user.id,
        },
      });
    });
    return this.get(vendaId, user);
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

  private async resolveFunil(
    tenantId: string,
    funilId?: string,
    userId?: string,
  ) {
    if (this.funilResolver) {
      return this.funilResolver.resolve({
        tenantId,
        tipo: FunilTipo.venda_usados,
        funilId,
        userId,
      });
    }
    if (funilId) {
      const funil = await this.prisma.funil.findFirst({
        where: { id: funilId, tenantId },
        include: { etapas: true },
      });
      if (!funil) throw new BadRequestException('Funil não encontrado.');
      if (funil.tipo !== FunilTipo.venda_usados) {
        throw new BadRequestException(
          'A venda de usados só pode usar um funil do tipo Venda de usados.',
        );
      }
      return funil;
    }
    const funil = await this.prisma.funil.findFirst({
      where: { tenantId, tipo: FunilTipo.venda_usados, ativo: true },
      include: { etapas: true },
    });
    if (!funil) throw new BadRequestException(SEM_FUNIL);
    return funil;
  }

  private exposeImovel(item: {
    tipo: Prisma.ImovelGetPayload<object>['tipo'];
    logradouro: string;
    numero: string;
    bairro: string;
    cidade: string;
    area: unknown;
    areaConstruida: unknown;
    [key: string]: unknown;
  }) {
    const { fotos, ...rest } = item;
    const fotosPublicas = Array.isArray(fotos)
      ? (fotos as Array<{ publicId?: string; id: string; url: string; sortOrder: number }>).map(
          ({ publicId: _p, ...foto }) => foto,
        )
      : [];
    return {
      ...rest,
      fotos: fotosPublicas,
      area: toMoneyNumber(item.area as never),
      areaConstruida: toMoneyNumber(item.areaConstruida as never),
      titulo: imovelTitulo(item),
    };
  }

  private exposeInteressado<
    T extends { precoMin: unknown; precoMax: unknown; areaMin: unknown },
  >(item: T) {
    return {
      ...item,
      precoMin: toMoneyNumber(item.precoMin as never),
      precoMax: toMoneyNumber(item.precoMax as never),
      areaMin: toMoneyNumber(item.areaMin as never),
    };
  }

  private exposeVenda(item: {
    precoVenda: unknown;
    imovel: {
      tipo: Prisma.ImovelGetPayload<object>['tipo'];
      logradouro: string;
      numero: string;
      bairro: string;
      cidade: string;
      area: unknown;
      areaConstruida: unknown;
    };
    vinculos?: Array<{ interessado: Record<string, unknown> & { precoMin: unknown; precoMax: unknown; areaMin: unknown } }>;
    [key: string]: unknown;
  }) {
    const funil = item.funil as
      | {
          inatividadeValor?: number;
          inatividadeUnidade?: 'minutos' | 'horas' | 'dias';
        }
      | undefined;
    const etapa = item.funilEtapa as
      | {
          papel: 'inicial' | 'analise' | 'venda' | 'perdido' | null;
          prazoValor: number | null;
          prazoUnidade: 'minutos' | 'horas' | 'dias';
          alertaAntecedenciaPercent?: number | null;
        }
      | undefined;
    return {
      ...item,
      precoVenda: toMoneyNumber(item.precoVenda as never),
      imovel: this.exposeImovel(item.imovel),
      vinculos: item.vinculos?.map((v) => ({
        ...v,
        interessado: this.exposeInteressado(v.interessado),
      })),
      monitoramento: computeOperacaoMonitoramento({
        createdAt: item.createdAt as Date,
        stageEnteredAt: item.stageEnteredAt as Date | undefined,
        lastStageChangeAt: item.lastStageChangeAt as Date | undefined,
        lastMovementAt: item.lastMovementAt as Date | undefined,
        lastHistoricoAt: item.lastHistoricoAt as Date | null | undefined,
        prazoDueAt: item.prazoDueAt as Date | null | undefined,
        alertaProximoAt: item.alertaProximoAt as Date | null | undefined,
        prazoAdiado: item.prazoAdiado as boolean | undefined,
        etapa: etapa ?? null,
        inatividadeValor: funil?.inatividadeValor,
        inatividadeUnidade: funil?.inatividadeUnidade,
        idleTitle: 'Venda sem movimentação',
      }),
    };
  }
}
