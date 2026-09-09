import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  CaptacaoHistoricoTipo,
  FunilTipo,
  Role,
  UserStatus,
  VendaUsadoHistoricoTipo,
  VendaUsadoPropostaStatus,
  VendaUsadoVisitaStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { pickFirstActiveEtapa } from '../captacao/captacao.util';
import { stageChangeTiming } from '../operacao/operacao-monitoramento.util';
import type {
  CreatePortalImovelDto,
  UpdatePortalImovelDto,
} from './dto/portal-imovel.dto';
import {
  CAPTACAO_HISTORICO_PORTAL,
  VENDA_HISTORICO_PORTAL,
  money,
  proximoPasso,
  situacaoImovel,
  tituloImovel,
  type SituacaoPortal,
} from './portal-proprietario.mappers';
import type { PortalProprietarioSession } from './portal-proprietario.types';
import { MediaService } from '../media/media.service';

const TEXTO_PORTAL_ACAO = {
  vi_e_concordo: 'O proprietário registrou: vi e concordo.',
  quero_falar: 'O proprietário pediu para falar com o corretor.',
} as const;

const PROPOSTAS_VISIVEIS: VendaUsadoPropostaStatus[] = [
  VendaUsadoPropostaStatus.enviada,
  VendaUsadoPropostaStatus.em_analise,
  VendaUsadoPropostaStatus.aceita,
  VendaUsadoPropostaStatus.recusada,
  VendaUsadoPropostaStatus.cancelada,
];

@Injectable()
export class PortalProprietarioImoveisService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly media?: MediaService,
  ) {}

  async dashboard(session: PortalProprietarioSession) {
    const imoveis = await this.listImoveis(session);
    const counts = {
      total: imoveis.length,
      disponiveis: 0,
      negociacao: 0,
      vendidos: 0,
      captacao: 0,
    };
    for (const item of imoveis) {
      if (item.situacao === 'disponivel') counts.disponiveis += 1;
      else if (item.situacao === 'negociacao') counts.negociacao += 1;
      else if (item.situacao === 'vendido') counts.vendidos += 1;
      else if (item.situacao === 'captacao') counts.captacao += 1;
    }
    return { resumo: counts, imoveis, novidades: await this.listNovidades(session) };
  }

  async createSugestao(
    session: PortalProprietarioSession,
    dto: CreatePortalImovelDto,
  ) {
    const logradouro = dto.logradouro.trim();
    if (!logradouro) {
      throw new BadRequestException('Informe o endereço do imóvel.');
    }

    const funil = await this.prisma.funil.findFirst({
      where: {
        tenantId: session.tenantId,
        tipo: FunilTipo.captacao,
        ativo: true,
      },
      include: { etapas: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!funil) {
      throw new BadRequestException(
        'A imobiliária ainda não tem um funil de captação ativo.',
      );
    }
    const etapa = pickFirstActiveEtapa(funil.etapas);
    if (!etapa) {
      throw new BadRequestException(
        'O funil de captação não possui etapas.',
      );
    }

    const ultima = await this.prisma.captacao.findFirst({
      where: {
        tenantId: session.tenantId,
        proprietarioId: session.proprietarioId,
      },
      orderBy: { createdAt: 'desc' },
      select: { responsavelId: true },
    });
    let responsavelId = ultima?.responsavelId;
    if (!responsavelId) {
      const user = await this.prisma.user.findFirst({
        where: {
          tenantId: session.tenantId,
          status: UserStatus.ativo,
          role: { in: [Role.admin, Role.gerente, Role.corretor] },
        },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      responsavelId = user?.id;
    }
    if (!responsavelId) {
      throw new BadRequestException(
        'Não há corretor na imobiliária para receber a sugestão.',
      );
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const imovel = await tx.imovel.create({
        data: {
          tenantId: session.tenantId,
          proprietarioId: session.proprietarioId,
          tipo: dto.tipo,
          cep: dto.cep?.trim() ?? '',
          logradouro,
          numero: dto.numero?.trim() ?? '',
          bairro: dto.bairro?.trim() ?? '',
          cidade: dto.cidade?.trim() ?? '',
          estado: dto.estado?.trim().toUpperCase() ?? '',
          descricao: dto.descricao?.trim() ?? '',
        },
      });
      const captacao = await tx.captacao.create({
        data: {
          tenantId: session.tenantId,
          proprietarioId: session.proprietarioId,
          imovelId: imovel.id,
          responsavelId,
          origem: 'Portal do proprietário',
          sugestaoProprietario: true,
          valorPretendido: dto.valorPretendido,
          funilId: funil.id,
          funilEtapaId: etapa.id,
          ...stageChangeTiming(new Date(), etapa),
        },
      });
      await tx.captacaoHistorico.create({
        data: {
          tenantId: session.tenantId,
          captacaoId: captacao.id,
          tipo: CaptacaoHistoricoTipo.criacao,
          texto: 'O proprietário sugeriu este imóvel pelo portal.',
        },
      });
      return imovel.id;
    });

    return this.getImovel(created, session);
  }

  async updateImovel(
    imovelId: string,
    session: PortalProprietarioSession,
    dto: UpdatePortalImovelDto,
  ) {
    const row = await this.requireImovel(imovelId, session);
    await this.prisma.imovel.update({
      where: { id: row.id },
      data: {
        ...(dto.tipo ? { tipo: dto.tipo } : {}),
        ...(dto.cep != null ? { cep: dto.cep.trim() } : {}),
        ...(dto.logradouro != null ? { logradouro: dto.logradouro.trim() } : {}),
        ...(dto.numero != null ? { numero: dto.numero.trim() } : {}),
        ...(dto.complemento != null ? { complemento: dto.complemento.trim() } : {}),
        ...(dto.bairro != null ? { bairro: dto.bairro.trim() } : {}),
        ...(dto.cidade != null ? { cidade: dto.cidade.trim() } : {}),
        ...(dto.estado != null ? { estado: dto.estado.trim().toUpperCase() } : {}),
        ...(dto.descricao != null ? { descricao: dto.descricao.trim() } : {}),
        ...(dto.area !== undefined ? { area: dto.area } : {}),
        ...(dto.quartos !== undefined ? { quartos: dto.quartos } : {}),
        ...(dto.suites !== undefined ? { suites: dto.suites } : {}),
        ...(dto.banheiros !== undefined ? { banheiros: dto.banheiros } : {}),
        ...(dto.vagas !== undefined ? { vagas: dto.vagas } : {}),
      },
    });
    const captacao = row.captacoes[0];
    if (captacao && dto.valorPretendido !== undefined) {
      await this.prisma.captacao.update({
        where: { id: captacao.id },
        data: { valorPretendido: dto.valorPretendido },
      });
      await this.prisma.captacaoHistorico.create({
        data: {
          tenantId: session.tenantId,
          captacaoId: captacao.id,
          tipo: CaptacaoHistoricoTipo.valor,
          texto: 'O proprietário atualizou o valor pretendido pelo portal.',
        },
      });
    } else if (captacao) {
      await this.prisma.captacaoHistorico.create({
        data: {
          tenantId: session.tenantId,
          captacaoId: captacao.id,
          tipo: CaptacaoHistoricoTipo.edicao,
          texto: 'O proprietário atualizou os dados do imóvel pelo portal.',
        },
      });
    }
    return this.getImovel(imovelId, session);
  }

  async cancelarCaptacao(
    imovelId: string,
    session: PortalProprietarioSession,
  ) {
    const row = await this.requireImovel(imovelId, session);
    const captacao = row.captacoes[0];
    if (!captacao) {
      throw new BadRequestException('Este imóvel não está em captação.');
    }
    if (captacao.canceladoPeloProprietario) {
      throw new BadRequestException('Esta captação já foi cancelada.');
    }
    if (captacao.funilEtapa?.papel === 'perdido') {
      throw new BadRequestException('Esta captação já foi encerrada.');
    }
    await this.prisma.captacao.update({
      where: { id: captacao.id },
      data: { canceladoPeloProprietario: true },
    });
    await this.prisma.captacaoHistorico.create({
      data: {
        tenantId: session.tenantId,
        captacaoId: captacao.id,
        tipo: CaptacaoHistoricoTipo.cancelamento,
        texto: 'O proprietário cancelou o anúncio pelo portal.',
      },
    });
    return this.getImovel(imovelId, session);
  }

  async uploadFoto(
    imovelId: string,
    session: PortalProprietarioSession,
    rawFile: Express.Multer.File | undefined,
  ) {
    const media = this.requireMedia();
    const row = await this.requireImovel(imovelId, session);
    const count = await this.prisma.imovelFoto.count({
      where: { imovelId: row.id, tenantId: session.tenantId },
    });
    if (count >= 4) {
      throw new BadRequestException(
        'O imóvel já tem 4 fotos. Remova uma para enviar outra.',
      );
    }
    const file = media.requireFile(rawFile);
    const uploaded = await media.uploadImage({
      buffer: file.buffer,
      mimetype: file.mimetype,
      folder: media.folder(session.tenantId, 'imoveis', row.id),
      maxWidth: 1600,
      maxHeight: 1200,
      fit: 'cover',
    });
    await this.prisma.imovelFoto.create({
      data: {
        tenantId: session.tenantId,
        imovelId: row.id,
        url: uploaded.url,
        publicId: uploaded.publicId,
        sortOrder: count,
      },
    });
    await this.syncCapa(row.id);
    return this.getImovel(imovelId, session);
  }

  async removeFoto(
    imovelId: string,
    session: PortalProprietarioSession,
    fotoId: string,
  ) {
    const row = await this.requireImovel(imovelId, session);
    const target = await this.prisma.imovelFoto.findFirst({
      where: { id: fotoId, imovelId: row.id, tenantId: session.tenantId },
    });
    if (!target) throw new NotFoundException('Foto não encontrada.');
    await this.media?.destroy(target.publicId);
    await this.prisma.imovelFoto.delete({ where: { id: target.id } });
    const remaining = await this.prisma.imovelFoto.findMany({
      where: { imovelId: row.id, tenantId: session.tenantId },
      orderBy: { sortOrder: 'asc' },
    });
    for (let i = 0; i < remaining.length; i += 1) {
      if (remaining[i]!.sortOrder !== i) {
        await this.prisma.imovelFoto.update({
          where: { id: remaining[i]!.id },
          data: { sortOrder: i },
        });
      }
    }
    await this.syncCapa(row.id);
    return this.getImovel(imovelId, session);
  }

  async listNovidades(session: PortalProprietarioSession) {
    const since = new Date();
    since.setDate(since.getDate() - 14);
    const imoveis = await this.prisma.imovel.findMany({
      where: {
        tenantId: session.tenantId,
        proprietarioId: session.proprietarioId,
      },
      select: {
        id: true,
        tipo: true,
        logradouro: true,
        numero: true,
        bairro: true,
        cidade: true,
        captacoes: { select: { id: true } },
        vendaUsado: { select: { id: true } },
      },
    });
    const eventos: Array<{
      id: string;
      imovelId: string;
      identificacao: string;
      origem: 'captacao' | 'venda';
      tipo: string;
      texto: string;
      createdAt: Date;
    }> = [];
    for (const imovel of imoveis) {
      const identificacao = tituloImovel(imovel);
      for (const captacao of imovel.captacoes) {
        const historicos = await this.prisma.captacaoHistorico.findMany({
          where: {
            captacaoId: captacao.id,
            tenantId: session.tenantId,
            tipo: { in: CAPTACAO_HISTORICO_PORTAL },
            createdAt: { gte: since },
          },
          orderBy: { createdAt: 'desc' },
          select: { id: true, tipo: true, texto: true, createdAt: true },
        });
        for (const item of historicos) {
          eventos.push({
            id: item.id,
            imovelId: imovel.id,
            identificacao,
            origem: 'captacao',
            tipo: item.tipo,
            texto: item.texto,
            createdAt: item.createdAt,
          });
        }
      }
      if (imovel.vendaUsado) {
        const historicos = await this.prisma.vendaUsadoHistorico.findMany({
          where: {
            vendaUsadoId: imovel.vendaUsado.id,
            tenantId: session.tenantId,
            tipo: { in: VENDA_HISTORICO_PORTAL },
            createdAt: { gte: since },
          },
          orderBy: { createdAt: 'desc' },
          select: { id: true, tipo: true, texto: true, createdAt: true },
        });
        for (const item of historicos) {
          eventos.push({
            id: item.id,
            imovelId: imovel.id,
            identificacao,
            origem: 'venda',
            tipo: item.tipo,
            texto: item.texto,
            createdAt: item.createdAt,
          });
        }
      }
    }
    eventos.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const acesso = await this.prisma.proprietarioPortalAcesso.findUnique({
      where: { id: session.acessoId },
      select: { novidadesLidasAt: true },
    });
    const lidasAt = acesso?.novidadesLidasAt?.getTime() ?? 0;
    return eventos.slice(0, 30).map((item) => ({
      ...item,
      lida: item.createdAt.getTime() <= lidasAt,
    }));
  }

  async marcarNovidadesLidas(session: PortalProprietarioSession) {
    await this.prisma.proprietarioPortalAcesso.update({
      where: { id: session.acessoId },
      data: { novidadesLidasAt: new Date() },
    });
    return this.listNovidades(session);
  }

  async registrarAcao(
    imovelId: string,
    session: PortalProprietarioSession,
    tipo: 'vi_e_concordo' | 'quero_falar',
  ) {
    const row = await this.requireImovel(imovelId, session);
    const texto = TEXTO_PORTAL_ACAO[tipo];
    const captacao = row.captacoes[0];
    if (captacao) {
      const jaTem = await this.prisma.captacaoHistorico.findFirst({
        where: {
          captacaoId: captacao.id,
          tipo: CaptacaoHistoricoTipo.portal_acao,
          texto,
        },
        select: { id: true },
      });
      if (jaTem) {
        return { ok: true, texto, jaRegistrado: true };
      }
      await this.prisma.captacaoHistorico.create({
        data: {
          tenantId: session.tenantId,
          captacaoId: captacao.id,
          tipo: CaptacaoHistoricoTipo.portal_acao,
          texto,
        },
      });
    } else if (row.vendaUsado) {
      const jaTem = await this.prisma.vendaUsadoHistorico.findFirst({
        where: {
          vendaUsadoId: row.vendaUsado.id,
          tipo: VendaUsadoHistoricoTipo.portal_acao,
          texto,
        },
        select: { id: true },
      });
      if (jaTem) {
        return { ok: true, texto, jaRegistrado: true };
      }
      await this.prisma.vendaUsadoHistorico.create({
        data: {
          tenantId: session.tenantId,
          vendaUsadoId: row.vendaUsado.id,
          tipo: VendaUsadoHistoricoTipo.portal_acao,
          texto,
        },
      });
    } else {
      throw new BadRequestException(
        'Não há operação em andamento para registrar esta ação.',
      );
    }
    return { ok: true, texto, jaRegistrado: false };
  }

  async listImoveis(session: PortalProprietarioSession) {
    const rows = await this.prisma.imovel.findMany({
      where: {
        tenantId: session.tenantId,
        proprietarioId: session.proprietarioId,
      },
      include: this.imovelListInclude(),
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => this.exposeListItem(row));
  }

  async getImovel(imovelId: string, session: PortalProprietarioSession) {
    const row = await this.requireImovel(imovelId, session);
    const captacao = row.captacoes[0] ?? null;
    const venda = row.vendaUsado;
    const propostasAbertas =
      venda?.propostas.filter((p) =>
        p.status === VendaUsadoPropostaStatus.enviada ||
          p.status === VendaUsadoPropostaStatus.em_analise,
      ).length ?? 0;

    return {
      id: row.id,
      identificacao: tituloImovel(row),
      tipo: row.tipo,
      cep: row.cep,
      logradouro: row.logradouro,
      numero: row.numero,
      complemento: row.complemento,
      bairro: row.bairro,
      cidade: row.cidade,
      estado: row.estado,
      area: money(row.area),
      areaConstruida: money(row.areaConstruida),
      quartos: row.quartos,
      suites: row.suites,
      banheiros: row.banheiros,
      vagas: row.vagas,
      tipoEmpreendimento: row.tipoEmpreendimento,
      aptsPorAndar: row.aptsPorAndar,
      andares: row.andares,
      torres: row.torres,
      descricao: row.descricao,
      comodidadesUnidade: row.comodidadesUnidade ?? [],
      comodidadesCondominio: row.comodidadesCondominio ?? [],
      fotoUrl: row.fotoUrl,
      fotos: (row.fotos ?? []).map((foto) => ({
        id: foto.id,
        url: foto.url,
        sortOrder: foto.sortOrder,
      })),
      valorPretendido: money(captacao?.valorPretendido),
      valorAvaliacao: money(captacao?.valorAvaliacao),
      precoVenda: money(venda?.precoVenda),
      dataCaptacao: captacao?.createdAt ?? row.createdAt,
      situacao: situacaoImovel({
        temCaptacao: Boolean(captacao),
        vendaStatus: venda?.status,
        propostasAbertas,
      }),
      proximoPasso: proximoPasso({
        situacao: situacaoImovel({
          temCaptacao: Boolean(captacao),
          vendaStatus: venda?.status,
          propostasAbertas,
        }),
        etapaCaptacao: captacao?.funilEtapa.label,
        exclusividade: captacao?.exclusividade,
        etapaVenda: venda?.funilEtapa.label,
        canceladoPeloProprietario: captacao?.canceladoPeloProprietario,
      }),
      contato: {
        imobiliaria: {
          nome: row.tenant?.name ?? '',
          telefone: row.tenant?.telefone ?? '',
        },
        corretor: (venda?.responsavel ?? captacao?.responsavel)
          ? {
              nome: (venda?.responsavel ?? captacao?.responsavel)!.name,
              telefone: (venda?.responsavel ?? captacao?.responsavel)!.phone ?? null,
              whatsapp:
                (venda?.responsavel ?? captacao?.responsavel)!.whatsapp ?? null,
            }
          : null,
      },
      captacao: captacao
        ? {
            id: captacao.id,
            etapa: captacao.funilEtapa.label,
            origem: captacao.origem,
            exclusividade: captacao.exclusividade,
            responsavel: captacao.responsavel.name,
            canceladoPeloProprietario: captacao.canceladoPeloProprietario,
          }
        : null,
      comercializacao: venda
        ? {
            status: venda.status,
            preco: money(venda.precoVenda),
            responsavel: venda.responsavel.name,
            etapa: venda.funilEtapa.label,
            interessados: venda.vinculos.length,
            visitas: venda.visitas.length,
            propostas: venda.propostas.filter((p) =>
              PROPOSTAS_VISIVEIS.includes(p.status),
            ).length,
            interessadosResumo: this.resumoInteresse(venda.vinculos),
          }
        : null,
      acoes: await this.acoesPortalRegistradas(row, session.tenantId),
    };
  }

  async getHistorico(imovelId: string, session: PortalProprietarioSession) {
    const row = await this.requireImovel(imovelId, session);
    const eventos: Array<{
      id: string;
      origem: 'captacao' | 'venda';
      tipo: string;
      texto: string;
      createdAt: Date;
    }> = [];

    for (const captacao of row.captacoes) {
      const historicos = await this.prisma.captacaoHistorico.findMany({
        where: {
          captacaoId: captacao.id,
          tenantId: session.tenantId,
          tipo: { in: CAPTACAO_HISTORICO_PORTAL },
        },
        orderBy: { createdAt: 'asc' },
        select: { id: true, tipo: true, texto: true, createdAt: true },
      });
      for (const item of historicos) {
        eventos.push({
          id: item.id,
          origem: 'captacao',
          tipo: item.tipo,
          texto: item.texto,
          createdAt: item.createdAt,
        });
      }
    }

    if (row.vendaUsado) {
      const historicos = await this.prisma.vendaUsadoHistorico.findMany({
        where: {
          vendaUsadoId: row.vendaUsado.id,
          tenantId: session.tenantId,
          tipo: { in: VENDA_HISTORICO_PORTAL },
        },
        orderBy: { createdAt: 'asc' },
        select: { id: true, tipo: true, texto: true, createdAt: true },
      });
      for (const item of historicos) {
        eventos.push({
          id: item.id,
          origem: 'venda',
          tipo: item.tipo,
          texto: item.texto,
          createdAt: item.createdAt,
        });
      }
    }

    eventos.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    return eventos;
  }

  async getVisitas(imovelId: string, session: PortalProprietarioSession) {
    const venda = await this.requireVenda(imovelId, session);
    if (!venda) return { proximas: [], realizadas: [], canceladas: [] };

    const visitas = await this.prisma.vendaUsadoVisita.findMany({
      where: { vendaUsadoId: venda.id, tenantId: session.tenantId },
      orderBy: { dataHora: 'desc' },
      select: {
        id: true,
        dataHora: true,
        status: true,
        feedbackAvaliacao: true,
        feedbackInteresse: true,
        feedbackComentarios: true,
        feedbackAt: true,
        interessado: { select: { nome: true } },
      },
    });

    const mapVisita = (item: (typeof visitas)[number]) => ({
      id: item.id,
      dataHora: item.dataHora,
      status: item.status,
      interessadoNome: item.interessado.nome,
      feedback:
        item.feedbackAt && item.feedbackComentarios
          ? {
              avaliacao: item.feedbackAvaliacao,
              interesse: item.feedbackInteresse,
              comentarios: item.feedbackComentarios,
            }
          : item.feedbackAt
            ? {
                avaliacao: item.feedbackAvaliacao,
                interesse: item.feedbackInteresse,
                comentarios: item.feedbackComentarios || null,
              }
            : null,
    });

    return {
      proximas: visitas
        .filter(
          (v) =>
            v.status === VendaUsadoVisitaStatus.agendada ||
            v.status === VendaUsadoVisitaStatus.confirmada,
        )
        .map(mapVisita),
      realizadas: visitas
        .filter((v) => v.status === VendaUsadoVisitaStatus.realizada)
        .map(mapVisita),
      canceladas: visitas
        .filter(
          (v) =>
            v.status === VendaUsadoVisitaStatus.cancelada ||
            v.status === VendaUsadoVisitaStatus.nao_compareceu,
        )
        .map(mapVisita),
    };
  }

  async getPropostas(imovelId: string, session: PortalProprietarioSession) {
    const venda = await this.requireVenda(imovelId, session);
    if (!venda) return [];

    const propostas = await this.prisma.vendaUsadoProposta.findMany({
      where: {
        vendaUsadoId: venda.id,
        tenantId: session.tenantId,
        status: { in: PROPOSTAS_VISIVEIS },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        interessado: { select: { nome: true } },
        negociacao: {
          include: {
            movimentos: { orderBy: { createdAt: 'asc' } },
          },
        },
      },
    });

    return propostas.map((item, index) => {
      const movimentos = item.negociacao?.movimentos ?? [];
      const ultimo = movimentos[movimentos.length - 1];
      return {
        id: item.id,
        numero: String(propostas.length - index).padStart(3, '0'),
        valor: money(item.valor),
        entrada: money(item.entrada),
        valorFinanciamento: money(item.valorFinanciamento),
        status: item.status,
        data: item.createdAt,
        interessadoNome: item.interessado.nome,
        negociacao: item.negociacao
          ? {
              status: item.negociacao.status,
              valorInicial: money(item.valor),
              ultimaContraproposta: money(ultimo?.valor) ?? money(item.valor),
            }
          : null,
      };
    });
  }

  async getFechamento(imovelId: string, session: PortalProprietarioSession) {
    const venda = await this.requireVenda(imovelId, session);
    if (!venda) return null;

    const fechamento = await this.prisma.vendaUsadoFechamento.findFirst({
      where: { vendaUsadoId: venda.id, tenantId: session.tenantId },
      include: {
        documentos: true,
        contrato: true,
      },
    });
    if (!fechamento) return null;

    const docs = fechamento.documentos;
    const aprovados = docs.filter((d) => d.status === 'aprovado').length;
    return {
      status: fechamento.status,
      documentacao: {
        aprovados,
        total: docs.length,
      },
      contrato: fechamento.contrato
        ? {
            numero: fechamento.contrato.numero,
            status: fechamento.contrato.status,
            data: fechamento.contrato.dataCriacao,
            assinado: fechamento.contrato.status === 'assinado',
          }
        : null,
    };
  }

  async getDocumentacao(imovelId: string, session: PortalProprietarioSession) {
    const venda = await this.requireVenda(imovelId, session);
    if (!venda) return [];

    const fechamento = await this.prisma.vendaUsadoFechamento.findFirst({
      where: { vendaUsadoId: venda.id, tenantId: session.tenantId },
      select: { id: true },
    });
    if (!fechamento) return [];

    const docs = await this.prisma.vendaUsadoDocumento.findMany({
      where: { fechamentoId: fechamento.id, tenantId: session.tenantId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        nome: true,
        status: true,
        categoria: true,
        obrigatorio: true,
        updatedAt: true,
      },
    });
    return docs;
  }

  async getContrato(imovelId: string, session: PortalProprietarioSession) {
    const fechamento = await this.getFechamento(imovelId, session);
    return fechamento?.contrato ?? null;
  }

  async getChaves(imovelId: string, session: PortalProprietarioSession) {
    await this.requireImovel(imovelId, session);
    const chaves = await this.prisma.imovelChave.findMany({
      where: { imovelId, tenantId: session.tenantId },
      include: {
        movimentos: {
          orderBy: { createdAt: 'desc' },
          take: 8,
          select: {
            id: true,
            tipo: true,
            quantidade: true,
            createdAt: true,
            responsavel: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const resumo = {
      total: chaves.reduce((acc, c) => acc + c.quantidade, 0),
      disponivel: 0,
      retirada: 0,
      entregue: 0,
    };
    for (const chave of chaves) {
      if (chave.status === 'disponivel') resumo.disponivel += chave.quantidade;
      if (chave.status === 'retirada') resumo.retirada += chave.quantidadeRetirada;
      if (chave.localizacaoAtual === 'comprador') resumo.entregue += 1;
    }

    return {
      resumo,
      itens: chaves.map((chave) => ({
        id: chave.id,
        identificacao: chave.identificacao,
        quantidade: chave.quantidade,
        status: chave.status,
        localizacaoAtual: chave.localizacaoAtual,
        historico: chave.movimentos.map((m) => ({
          id: m.id,
          tipo: m.tipo,
          quantidade: m.quantidade,
          createdAt: m.createdAt,
          responsavel: m.responsavel?.name ?? null,
        })),
      })),
    };
  }

  async getPosVenda(imovelId: string, session: PortalProprietarioSession) {
    await this.requireImovel(imovelId, session);
    const pos = await this.prisma.vendaUsadoPosVenda.findFirst({
      where: {
        imovelId,
        tenantId: session.tenantId,
        proprietarioId: session.proprietarioId,
      },
      include: {
        pendencias: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            titulo: true,
            status: true,
            prazo: true,
            obrigatoria: true,
          },
        },
      },
    });
    if (!pos) return null;
    return {
      status: pos.status,
      pendencias: pos.pendencias,
    };
  }

  private imovelListInclude() {
    return {
      fotos: {
        orderBy: { sortOrder: 'asc' as const },
        select: { id: true, url: true, sortOrder: true },
      },
      tenant: { select: { name: true, telefone: true } },
      captacoes: {
        orderBy: { createdAt: 'desc' as const },
        take: 1,
        include: {
          funilEtapa: { select: { label: true, papel: true } },
          responsavel: { select: { name: true, phone: true, whatsapp: true } },
        },
      },
      vendaUsado: {
        include: {
          responsavel: { select: { name: true, phone: true, whatsapp: true } },
          funilEtapa: { select: { label: true } },
          vinculos: { select: { id: true, interesse: true } },
          visitas: { select: { id: true } },
          propostas: { select: { id: true, status: true } },
        },
      },
    };
  }

  private exposeListItem(row: {
    id: string;
    tipo: Parameters<typeof tituloImovel>[0]['tipo'];
    logradouro: string;
    numero: string;
    bairro: string;
    cidade: string;
    fotoUrl?: string | null;
    fotos?: Array<{ id: string; url: string; sortOrder: number }>;
    tenant?: { name: string; telefone: string };
    createdAt: Date;
    captacoes: Array<{
      createdAt: Date;
      valorPretendido: unknown;
      exclusividade?: boolean;
      canceladoPeloProprietario?: boolean;
      funilEtapa: { label: string };
      responsavel: { name: string; phone?: string | null; whatsapp?: string | null };
    }>;
    vendaUsado: {
      status: string;
      precoVenda: unknown;
      responsavel: { name: string; phone?: string | null; whatsapp?: string | null };
      funilEtapa?: { label: string };
      vinculos: Array<{ id: string; interesse: string }>;
      visitas: Array<{ id: string }>;
      propostas: Array<{ id: string; status: VendaUsadoPropostaStatus }>;
    } | null;
  }) {
    const captacao = row.captacoes[0] ?? null;
    const venda = row.vendaUsado;
    const propostasAbertas =
      venda?.propostas.filter((p) =>
        p.status === VendaUsadoPropostaStatus.enviada ||
          p.status === VendaUsadoPropostaStatus.em_analise,
      ).length ?? 0;
    const situacao: SituacaoPortal = situacaoImovel({
      temCaptacao: Boolean(captacao),
      vendaStatus: venda?.status,
      propostasAbertas,
    });
    return {
      id: row.id,
      identificacao: tituloImovel(row),
      tipo: row.tipo,
      endereco: [row.logradouro, row.numero].filter(Boolean).join(', '),
      bairro: row.bairro,
      cidade: row.cidade,
      fotoUrl: row.fotoUrl ?? row.fotos?.[0]?.url ?? null,
      fotos: row.fotos ?? [],
      valor: money(venda?.precoVenda) ?? money(captacao?.valorPretendido),
      situacao,
      proximoPasso: proximoPasso({
        situacao,
        etapaCaptacao: captacao?.funilEtapa.label,
        exclusividade: captacao?.exclusividade,
        etapaVenda: venda?.funilEtapa?.label,
        canceladoPeloProprietario: captacao?.canceladoPeloProprietario,
      }),
      canceladoPeloProprietario: Boolean(captacao?.canceladoPeloProprietario),
      contato: {
        imobiliaria: {
          nome: row.tenant?.name ?? '',
          telefone: row.tenant?.telefone ?? '',
        },
        corretor: (venda?.responsavel ?? captacao?.responsavel)
          ? {
              nome: (venda?.responsavel ?? captacao?.responsavel)!.name,
              telefone: (venda?.responsavel ?? captacao?.responsavel)!.phone ?? null,
              whatsapp:
                (venda?.responsavel ?? captacao?.responsavel)!.whatsapp ?? null,
            }
          : null,
      },
      temComercializacao: Boolean(venda),
      statusOperacao: venda?.status ?? (captacao ? 'captacao' : null),
      responsavel:
        venda?.responsavel.name ?? captacao?.responsavel.name ?? null,
      dataCaptacao: captacao?.createdAt ?? row.createdAt,
      interessados: venda?.vinculos.length ?? 0,
      visitas: venda?.visitas.length ?? 0,
      propostas:
        venda?.propostas.filter((p) => PROPOSTAS_VISIVEIS.includes(p.status))
          .length ?? 0,
    };
  }

  private resumoInteresse(
    vinculos: Array<{ interesse: string }>,
  ): Record<string, number> {
    const resumo: Record<string, number> = {};
    for (const item of vinculos) {
      resumo[item.interesse] = (resumo[item.interesse] ?? 0) + 1;
    }
    return resumo;
  }

  private async acoesPortalRegistradas(
    row: { captacoes: Array<{ id: string }>; vendaUsado: { id: string } | null },
    tenantId: string,
  ) {
    const textos: string[] = [];
    const captacao = row.captacoes[0];
    if (captacao) {
      const items = await this.prisma.captacaoHistorico.findMany({
        where: {
          captacaoId: captacao.id,
          tenantId,
          tipo: CaptacaoHistoricoTipo.portal_acao,
          texto: { in: Object.values(TEXTO_PORTAL_ACAO) },
        },
        select: { texto: true },
      });
      textos.push(...items.map((item) => item.texto));
    } else if (row.vendaUsado) {
      const items = await this.prisma.vendaUsadoHistorico.findMany({
        where: {
          vendaUsadoId: row.vendaUsado.id,
          tenantId,
          tipo: VendaUsadoHistoricoTipo.portal_acao,
          texto: { in: Object.values(TEXTO_PORTAL_ACAO) },
        },
        select: { texto: true },
      });
      textos.push(...items.map((item) => item.texto));
    }
    return {
      vi_e_concordo: textos.includes(TEXTO_PORTAL_ACAO.vi_e_concordo),
      quero_falar: textos.includes(TEXTO_PORTAL_ACAO.quero_falar),
    };
  }

  private requireMedia() {
    if (!this.media) {
      throw new ServiceUnavailableException(
        'Upload de imagens indisponível no momento.',
      );
    }
    return this.media;
  }

  private async syncCapa(imovelId: string) {
    const capa = await this.prisma.imovelFoto.findFirst({
      where: { imovelId },
      orderBy: { sortOrder: 'asc' },
    });
    await this.prisma.imovel.update({
      where: { id: imovelId },
      data: {
        fotoUrl: capa?.url ?? null,
        fotoPublicId: capa?.publicId ?? null,
      },
    });
  }

  private async requireImovel(
    imovelId: string,
    session: PortalProprietarioSession,
  ) {
    const row = await this.prisma.imovel.findFirst({
      where: {
        id: imovelId,
        tenantId: session.tenantId,
        proprietarioId: session.proprietarioId,
      },
      include: {
        fotos: {
          orderBy: { sortOrder: 'asc' },
          select: { id: true, url: true, sortOrder: true },
        },
        tenant: { select: { name: true, telefone: true } },
        captacoes: {
          orderBy: { createdAt: 'desc' },
          include: {
            funilEtapa: { select: { label: true, papel: true } },
            responsavel: { select: { name: true, phone: true, whatsapp: true } },
          },
        },
        vendaUsado: {
          include: {
            responsavel: { select: { name: true, phone: true, whatsapp: true } },
            funilEtapa: { select: { label: true } },
            vinculos: { select: { interesse: true } },
            visitas: { select: { id: true } },
            propostas: { select: { status: true } },
          },
        },
      },
    });
    if (!row) throw new NotFoundException('Imóvel não encontrado.');
    return row;
  }

  private async requireVenda(
    imovelId: string,
    session: PortalProprietarioSession,
  ) {
    const row = await this.requireImovel(imovelId, session);
    return row.vendaUsado;
  }
}
