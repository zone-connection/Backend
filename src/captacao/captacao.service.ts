import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  CaptacaoHistoricoTipo,
  CaptacaoImovelTipo,
  FunilTipo,
  OportunidadeCaptacaoStatus,
  PessoaTipo,
  Prisma,
  UserStatus,
  VendaUsadoHistoricoTipo,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FunilResolverService } from '../funis/funil-resolver.service';
import { MediaService } from '../media/media.service';
import { TarefasService } from '../tarefas/tarefas.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { requireTenantId } from '../common/utils/tenant';
import {
  CAPTACAO_IMOVEL_TIPO_LABEL,
  CAPTACAO_MOTIVOS_PERDA,
  IMOVEL_MAX_FOTOS,
  imovelTitulo,
} from './captacao.constants';
import { imovelCapaResolvida } from './imovel-capa';
import {
  moneyEqual,
  pickFirstActiveEtapa,
  toMoneyNumber,
  normalizeCpfCnpj,
  assertCpfCnpj,
  mergeFunilPorEtapa,
  normalizeComodidades,
} from './captacao.util';
import {
  textoCriacao,
  textoEdicao,
  textoEtapa,
  textoExclusividade,
  textoResponsavel,
  textoValorAvaliacao,
  textoValorPretendido,
} from './captacao-history.util';
import {
  CreateProprietarioDto,
  QueryProprietariosDto,
  UpdateProprietarioDto,
} from './dto/proprietario.dto';
import {
  CreateImovelDto,
  QueryImoveisDto,
  UpdateImovelDto,
} from './dto/imovel.dto';
import {
  CreateCaptacaoDto,
  QueryCaptacoesDto,
  UpdateCaptacaoDto,
} from './dto/captacao.dto';
import {
  CreateOportunidadeCaptacaoDto,
  PerderOportunidadeDto,
  UpdateOportunidadeCaptacaoDto,
} from './dto/oportunidade-captacao.dto';
import {
  computeOperacaoMonitoramento,
  followUpTiming,
  stageChangeTiming,
} from '../operacao/operacao-monitoramento.util';

const SEM_FUNIL =
  'Não existe um funil de Captação ativo para este Tenant.';

const proprietarioSelect = {
  id: true,
  nome: true,
  tipoPessoa: true,
  cpfCnpj: true,
  telefone: true,
  email: true,
  observacoes: true,
  createdAt: true,
  updatedAt: true,
  portalAcesso: { select: { status: true, lastLoginAt: true } },
  _count: { select: { imoveis: true, captacoes: true } },
} as const;

const imovelInclude = {
  proprietario: { select: { id: true, nome: true, telefone: true, email: true } },
  fotos: { orderBy: { sortOrder: 'asc' as const } },
  captacoes: {
    select: {
      id: true,
      valorPretendido: true,
      funilEtapa: { select: { id: true, label: true, papel: true } },
    },
    orderBy: { createdAt: 'desc' as const },
    take: 1,
  },
} as const;

const captacaoInclude = {
  proprietario: {
    select: { id: true, nome: true, telefone: true, email: true, tipoPessoa: true },
  },
  imovel: {
    include: {
      fotos: { orderBy: { sortOrder: 'asc' as const } },
    },
  },
  responsavel: { select: { id: true, name: true, email: true } },
  funil: {
    select: {
      id: true,
      name: true,
      tipo: true,
      ativo: true,
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
      sortOrder: true,
      papel: true,
      active: true,
      prazoValor: true,
      prazoUnidade: true,
      alertaAntecedenciaPercent: true,
    },
  },
} as const;

@Injectable()
export class CaptacaoService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly funilResolver?: FunilResolverService,
    @Optional() private readonly media?: MediaService,
    @Optional() private readonly tarefas?: TarefasService,
  ) {}

  listProprietarios(query: QueryProprietariosDto, user: AuthenticatedUser) {
    const tenantId = requireTenantId(user);
    const where: Prisma.ProprietarioWhereInput = { tenantId };
    if (query.search) {
      where.OR = [
        { nome: { contains: query.search, mode: 'insensitive' } },
        { telefone: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
        { cpfCnpj: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    return this.prisma.proprietario.findMany({
      where,
      select: proprietarioSelect,
      orderBy: { nome: 'asc' },
    }).then((items) =>
      items.map((item) => {
        const { portalAcesso, ...rest } = item;
        return {
          ...rest,
          portalAcesso: {
            ativo: portalAcesso?.status === 'ativo',
            lastLoginAt: portalAcesso?.lastLoginAt ?? null,
          },
        };
      }),
    );
  }

  async getProprietario(id: string, user: AuthenticatedUser) {
    const tenantId = requireTenantId(user);
    const item = await this.prisma.proprietario.findFirst({
      where: { id, tenantId },
      include: {
        portalAcesso: { select: { status: true, lastLoginAt: true } },
        imoveis: {
          orderBy: { createdAt: 'desc' },
          include: imovelInclude,
        },
        _count: { select: { imoveis: true, captacoes: true } },
      },
    });
    if (!item) throw new NotFoundException('Proprietário não encontrado.');
    const { portalAcesso, ...rest } = item;
    return {
      ...rest,
      portalAcesso: {
        ativo: portalAcesso?.status === 'ativo',
        lastLoginAt: portalAcesso?.lastLoginAt ?? null,
      },
      imoveis: item.imoveis.map((imovel) => this.exposeImovel(imovel)),
    };
  }

  createProprietario(dto: CreateProprietarioDto, user: AuthenticatedUser) {
    const tenantId = requireTenantId(user);
    const tipoPessoa = dto.tipoPessoa ?? PessoaTipo.fisica;
    const cpfCnpj = normalizeCpfCnpj(dto.cpfCnpj, tipoPessoa);
    assertCpfCnpj(cpfCnpj, tipoPessoa);
    return this.prisma.proprietario.create({
      data: {
        tenantId,
        nome: dto.nome.trim(),
        tipoPessoa,
        cpfCnpj,
        telefone: dto.telefone?.trim() ?? '',
        email: dto.email?.trim() ?? '',
        observacoes: dto.observacoes?.trim() ?? '',
      },
      select: proprietarioSelect,
    });
  }

  async updateProprietario(
    id: string,
    dto: UpdateProprietarioDto,
    user: AuthenticatedUser,
  ) {
    const current = await this.getProprietario(id, user);
    const tipoPessoa = dto.tipoPessoa ?? current.tipoPessoa;
    const cpfCnpj =
      dto.cpfCnpj != null
        ? normalizeCpfCnpj(dto.cpfCnpj, tipoPessoa)
        : undefined;
    if (cpfCnpj != null) assertCpfCnpj(cpfCnpj, tipoPessoa);
    return this.prisma.proprietario.update({
      where: { id },
      data: {
        ...(dto.nome != null ? { nome: dto.nome.trim() } : {}),
        ...(dto.tipoPessoa != null ? { tipoPessoa: dto.tipoPessoa } : {}),
        ...(cpfCnpj != null ? { cpfCnpj } : {}),
        ...(dto.telefone != null ? { telefone: dto.telefone.trim() } : {}),
        ...(dto.email != null ? { email: dto.email.trim() } : {}),
        ...(dto.observacoes != null
          ? { observacoes: dto.observacoes.trim() }
          : {}),
      },
      select: proprietarioSelect,
    });
  }

  async deleteProprietario(id: string, user: AuthenticatedUser) {
    const tenantId = requireTenantId(user);
    const item = await this.prisma.proprietario.findFirst({
      where: { id, tenantId },
      select: {
        id: true,
        _count: { select: { imoveis: true, captacoes: true, posVendas: true } },
      },
    });
    if (!item) throw new NotFoundException('Proprietário não encontrado.');
    if (item._count.imoveis || item._count.captacoes || item._count.posVendas) {
      throw new ConflictException(
        'Este proprietário ainda tem imóveis, captações ou pós-venda. Exclua-os antes.',
      );
    }
    await this.prisma.proprietario.delete({ where: { id } });
  }

  async listImoveis(query: QueryImoveisDto, user: AuthenticatedUser) {
    const tenantId = requireTenantId(user);
    const where: Prisma.ImovelWhereInput = { tenantId };
    if (query.proprietarioId) where.proprietarioId = query.proprietarioId;
    if (query.tipo) where.tipo = query.tipo;
    if (query.cidade) {
      where.cidade = { contains: query.cidade, mode: 'insensitive' };
    }
    if (query.search) {
      where.OR = [
        { logradouro: { contains: query.search, mode: 'insensitive' } },
        { bairro: { contains: query.search, mode: 'insensitive' } },
        { cidade: { contains: query.search, mode: 'insensitive' } },
        { proprietario: { nome: { contains: query.search, mode: 'insensitive' } } },
      ];
    }
    const items = await this.prisma.imovel.findMany({
      where,
      include: imovelInclude,
      orderBy: { createdAt: 'desc' },
    });
    return items.map((item) => this.exposeImovel(item));
  }

  async getImovel(id: string, user: AuthenticatedUser) {
    const tenantId = requireTenantId(user);
    const item = await this.prisma.imovel.findFirst({
      where: { id, tenantId },
      include: {
        ...imovelInclude,
        captacoes: {
          include: {
            funilEtapa: { select: { id: true, label: true, papel: true } },
            responsavel: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!item) throw new NotFoundException('Imóvel não encontrado.');
    return this.exposeImovel(item);
  }

  async createImovel(dto: CreateImovelDto, user: AuthenticatedUser) {
    const tenantId = requireTenantId(user);
    await this.requireProprietario(dto.proprietarioId, tenantId);
    const created = await this.prisma.imovel.create({
      data: {
        tenantId,
        proprietarioId: dto.proprietarioId,
        tipo: dto.tipo,
        cep: dto.cep?.trim() ?? '',
        logradouro: dto.logradouro?.trim() ?? '',
        numero: dto.numero?.trim() ?? '',
        complemento: dto.complemento?.trim() ?? '',
        bairro: dto.bairro?.trim() ?? '',
        cidade: dto.cidade?.trim() ?? '',
        estado: dto.estado?.trim().toUpperCase() ?? '',
        area: dto.area,
        areaConstruida: dto.areaConstruida,
        quartos: dto.quartos,
        suites: dto.suites,
        banheiros: dto.banheiros,
        vagas: dto.vagas,
        tipoEmpreendimento: dto.tipoEmpreendimento?.trim() ?? '',
        aptsPorAndar: dto.aptsPorAndar,
        andares: dto.andares,
        torres: dto.torres,
        descricao: dto.descricao?.trim() ?? '',
        comodidadesUnidade: normalizeComodidades(dto.comodidadesUnidade),
        comodidadesCondominio: normalizeComodidades(
          dto.comodidadesCondominio,
        ),
        observacoes: dto.observacoes?.trim() ?? '',
      },
      include: imovelInclude,
    });
    const ligado = await this.espelharNoCatalogo(created);
    return this.exposeImovel(ligado);
  }

  async updateImovel(id: string, dto: UpdateImovelDto, user: AuthenticatedUser) {
    const tenantId = requireTenantId(user);
    const current = await this.prisma.imovel.findFirst({
      where: { id, tenantId },
    });
    if (!current) throw new NotFoundException('Imóvel não encontrado.');
    if (dto.proprietarioId) {
      await this.requireProprietario(dto.proprietarioId, tenantId);
    }
    const updated = await this.prisma.imovel.update({
      where: { id },
      data: {
        ...(dto.proprietarioId ? { proprietarioId: dto.proprietarioId } : {}),
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
      include: imovelInclude,
    });
    const ligado = await this.espelharNoCatalogo(updated);
    return this.exposeImovel(ligado);
  }

  async deleteImovel(id: string, user: AuthenticatedUser) {
    const tenantId = requireTenantId(user);
    const item = await this.prisma.imovel.findFirst({
      where: { id, tenantId },
      select: {
        id: true,
        fotoPublicId: true,
        empreendimentoId: true,
        vendaUsado: { select: { id: true } },
        _count: { select: { captacoes: true, posVendas: true } },
      },
    });
    if (!item) throw new NotFoundException('Imóvel não encontrado.');
    if (item.vendaUsado) {
      throw new ConflictException(
        'Este imóvel está na venda de usados. Remova a venda antes de excluir o imóvel.',
      );
    }
    if (item._count.posVendas) {
      throw new ConflictException(
        'Este imóvel tem pós-venda vinculada e não pode ser excluído.',
      );
    }
    const fotos = await this.prisma.imovelFoto.findMany({
      where: { imovelId: id, tenantId },
      select: { publicId: true },
    });
    await this.prisma.$transaction(async (tx) => {
      await tx.captacao.deleteMany({ where: { imovelId: id, tenantId } });
      await tx.imovel.delete({ where: { id } });
      if (!item.empreendimentoId) return;
      const espelho = await tx.empreendimento.findFirst({
        where: {
          id: item.empreendimentoId,
          tenantId,
          externalKey: `captacao-imovel-${id}`,
        },
        select: {
          id: true,
          _count: {
            select: {
              documentacoes: true,
              propostas: true,
              propostaVinculos: true,
              agendamentos: true,
              leads: true,
              muralChaves: true,
              cadastroVendas: true,
            },
          },
        },
      });
      if (!espelho) return;
      const uso = espelho._count;
      const emUso = Object.values(uso).some((total) => total > 0);
      if (!emUso) {
        await tx.empreendimento.delete({ where: { id: espelho.id } });
      }
    });
    for (const foto of fotos) {
      await this.media?.destroy(foto.publicId);
    }
    await this.media?.destroy(item.fotoPublicId);
  }

  async uploadFoto(
    id: string,
    rawFile: Express.Multer.File | undefined,
    user: AuthenticatedUser,
  ) {
    const media = this.requireMedia();
    const tenantId = requireTenantId(user);
    const current = await this.prisma.imovel.findFirst({
      where: { id, tenantId },
      select: { id: true, _count: { select: { fotos: true } } },
    });
    if (!current) throw new NotFoundException('Imóvel não encontrado.');
    if (current._count.fotos >= IMOVEL_MAX_FOTOS) {
      throw new BadRequestException(
        `O imóvel já tem ${IMOVEL_MAX_FOTOS} fotos. Remova uma para enviar outra.`,
      );
    }
    const file = media.requireFile(rawFile);
    const uploaded = await media.uploadImage({
      buffer: file.buffer,
      mimetype: file.mimetype,
      folder: media.folder(tenantId, 'imoveis', id),
      maxWidth: 1600,
      maxHeight: 1200,
      fit: 'cover',
    });
    const sortOrder = current._count.fotos;
    await this.prisma.imovelFoto.create({
      data: {
        tenantId,
        imovelId: id,
        url: uploaded.url,
        publicId: uploaded.publicId,
        sortOrder,
      },
    });
    return this.reloadImovel(id);
  }

  async removeFoto(id: string, user: AuthenticatedUser, fotoId?: string) {
    const tenantId = requireTenantId(user);
    const current = await this.prisma.imovel.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!current) throw new NotFoundException('Imóvel não encontrado.');
    const target = fotoId
      ? await this.prisma.imovelFoto.findFirst({
          where: { id: fotoId, imovelId: id, tenantId },
        })
      : await this.prisma.imovelFoto.findFirst({
          where: { imovelId: id, tenantId },
          orderBy: { sortOrder: 'asc' },
        });
    if (!target) throw new NotFoundException('Foto não encontrada.');
    await this.media?.destroy(target.publicId);
    await this.prisma.imovelFoto.delete({ where: { id: target.id } });
    const remaining = await this.prisma.imovelFoto.findMany({
      where: { imovelId: id, tenantId },
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
    return this.reloadImovel(id);
  }

  private async reloadImovel(id: string) {
    const capa = await this.prisma.imovelFoto.findFirst({
      where: { imovelId: id },
      orderBy: { sortOrder: 'asc' },
    });
    const updated = await this.prisma.imovel.update({
      where: { id },
      data: {
        fotoUrl: capa?.url ?? null,
        fotoPublicId: capa?.publicId ?? null,
      },
      include: imovelInclude,
    });
    const ligado = await this.espelharNoCatalogo(updated);
    return this.exposeImovel(ligado);
  }

  private dadosEmpreendimento(imovel: {
    tipo: Prisma.ImovelGetPayload<object>['tipo'];
    logradouro: string;
    numero: string;
    complemento: string;
    bairro: string;
    cidade: string;
    quartos: number | null;
    banheiros: number | null;
    vagas: number | null;
    area: Prisma.Decimal | number | null;
    descricao: string;
    observacoes: string;
    fotoUrl: string | null;
    fotoPublicId: string | null;
    fotos?: Array<{ url: string; publicId: string; sortOrder: number }>;
  }) {
    const endereco = [
      imovel.logradouro,
      imovel.numero,
      imovel.complemento,
      imovel.bairro,
    ]
      .map((parte) => parte.trim())
      .filter(Boolean)
      .join(', ');
    const area = imovel.area == null ? null : Number(imovel.area);
    const fotos = [...(imovel.fotos ?? [])].sort(
      (a, b) => a.sortOrder - b.sortOrder,
    );
    const imagens =
      fotos.length > 0
        ? fotos.map((foto) => ({
            url: foto.url,
            publicId: foto.publicId,
          }))
        : imovel.fotoUrl
          ? [{ url: imovel.fotoUrl, publicId: imovel.fotoPublicId ?? '' }]
          : [];
    return {
      nome: (imovelTitulo(imovel) || 'Imóvel').slice(0, 180),
      cidade: imovel.cidade.trim() || null,
      endereco: endereco || null,
      tipo: CAPTACAO_IMOVEL_TIPO_LABEL[imovel.tipo] ?? null,
      quartos: imovel.quartos,
      banheiros: imovel.banheiros,
      vagas: imovel.vagas,
      areaM2: area != null && Number.isFinite(area) ? area : null,
      observacao:
        imovel.descricao.trim() || imovel.observacoes.trim() || null,
      imagemUrl: imagens[0]?.url ?? imovel.fotoUrl,
      imagens,
    };
  }

  private async espelharNoCatalogo<T extends { id: string; tenantId: string; empreendimentoId?: string | null }>(
    imovel: T,
  ): Promise<T> {
    const completo = await this.prisma.imovel.findFirst({
      where: { id: imovel.id, tenantId: imovel.tenantId },
      include: { ...imovelInclude, fotos: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!completo) return imovel;
    const dados = this.dadosEmpreendimento(completo);
    if (completo.empreendimentoId) {
      const atual = await this.prisma.empreendimento.findFirst({
        where: { id: completo.empreendimentoId, tenantId: completo.tenantId },
        select: { id: true, imagens: true },
      });
      if (atual) {
        const imagensAtuais = Array.isArray(atual.imagens) ? atual.imagens : [];
        await this.prisma.empreendimento.update({
          where: { id: atual.id },
          data: {
            nome: dados.nome,
            cidade: dados.cidade,
            endereco: dados.endereco,
            tipo: dados.tipo,
            quartos: dados.quartos,
            banheiros: dados.banheiros,
            vagas: dados.vagas,
            areaM2: dados.areaM2,
            observacao: dados.observacao,
            imagemUrl: dados.imagemUrl,
            ...(imagensAtuais.length <= 1
              ? { imagens: dados.imagens }
              : {}),
          },
        });
      }
      return completo as unknown as T;
    }
    const criado = await this.prisma.empreendimento.create({
      data: {
        tenantId: completo.tenantId,
        externalKey: `captacao-imovel-${completo.id}`,
        tags: ['Captação'],
        ativo: true,
        nome: dados.nome,
        cidade: dados.cidade,
        endereco: dados.endereco,
        tipo: dados.tipo,
        quartos: dados.quartos,
        banheiros: dados.banheiros,
        vagas: dados.vagas,
        areaM2: dados.areaM2,
        observacao: dados.observacao,
        imagemUrl: dados.imagemUrl,
        imagens: dados.imagens,
      },
    });
    const ligado = await this.prisma.imovel.update({
      where: { id: completo.id },
      data: { empreendimentoId: criado.id },
      include: imovelInclude,
    });
    return ligado as unknown as T;
  }

  async listCaptacoes(query: QueryCaptacoesDto, user: AuthenticatedUser) {
    const tenantId = requireTenantId(user);
    const where: Prisma.CaptacaoWhereInput = { tenantId };
    if (query.proprietarioId) where.proprietarioId = query.proprietarioId;
    if (query.responsavelId) where.responsavelId = query.responsavelId;
    if (query.funilEtapaId) where.funilEtapaId = query.funilEtapaId;
    if (query.origem) {
      where.origem = { contains: query.origem, mode: 'insensitive' };
    }
    if (typeof query.exclusividade === 'boolean') {
      where.exclusividade = query.exclusividade;
    }
    const imovelFilter: Prisma.ImovelWhereInput = {};
    if (query.tipo) imovelFilter.tipo = query.tipo;
    if (query.cidade) {
      imovelFilter.cidade = { contains: query.cidade, mode: 'insensitive' };
    }
    if (query.tipo || query.cidade) where.imovel = imovelFilter;
    if (query.createdFrom || query.createdTo) {
      where.createdAt = {};
      if (query.createdFrom) where.createdAt.gte = new Date(query.createdFrom);
      if (query.createdTo) {
        const end = new Date(query.createdTo);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }
    const items = await this.prisma.captacao.findMany({
      where,
      include: captacaoInclude,
      orderBy: { updatedAt: 'desc' },
    });
    return items.map((item) => this.exposeCaptacao(item));
  }

  async getCaptacao(id: string, user: AuthenticatedUser) {
    const tenantId = requireTenantId(user);
    const item = await this.prisma.captacao.findFirst({
      where: { id, tenantId },
      include: {
        ...captacaoInclude,
        historicos: {
          orderBy: { createdAt: 'desc' },
          include: { autor: { select: { id: true, name: true } } },
        },
      },
    });
    if (!item) throw new NotFoundException('Captação não encontrada.');
    return this.exposeCaptacao(item);
  }

  async createCaptacao(dto: CreateCaptacaoDto, user: AuthenticatedUser) {
    const tenantId = requireTenantId(user);
    const proprietario = await this.requireProprietario(
      dto.proprietarioId,
      tenantId,
    );
    const imovel = await this.requireImovel(dto.imovelId, tenantId);
    if (imovel.proprietarioId !== proprietario.id) {
      throw new BadRequestException(
        'O imóvel não pertence ao proprietário informado.',
      );
    }
    await this.requireResponsavel(dto.responsavelId, tenantId);
    const funil = await this.resolveFunilCaptacao(
      tenantId,
      dto.funilId,
      dto.responsavelId,
    );
    const etapa = await this.resolveEtapa(funil, dto.funilEtapaId);

    const created = await this.prisma.$transaction(async (tx) => {
      const captacao = await tx.captacao.create({
        data: {
          tenantId,
          proprietarioId: dto.proprietarioId,
          imovelId: dto.imovelId,
          responsavelId: dto.responsavelId,
          origem: dto.origem?.trim() ?? '',
          exclusividade: dto.exclusividade ?? false,
          valorPretendido: dto.valorPretendido,
          valorAvaliacao: dto.valorAvaliacao,
          funilId: funil.id,
          funilEtapaId: etapa.id,
          ...stageChangeTiming(new Date(), etapa),
        },
        include: captacaoInclude,
      });
      await tx.captacaoHistorico.create({
        data: {
          tenantId,
          captacaoId: captacao.id,
          tipo: CaptacaoHistoricoTipo.criacao,
          texto: textoCriacao(user.name),
          autorId: user.id,
        },
      });
      return captacao;
    });
    return this.getCaptacao(created.id, user);
  }

  async updateCaptacao(
    id: string,
    dto: UpdateCaptacaoDto,
    user: AuthenticatedUser,
  ) {
    const tenantId = requireTenantId(user);
    const current = await this.prisma.captacao.findFirst({
      where: { id, tenantId },
      include: {
        funilEtapa: true,
        funil: { include: { etapas: true } },
        responsavel: { select: { id: true, name: true } },
      },
    });
    if (!current) throw new NotFoundException('Captação não encontrada.');

    if (dto.responsavelId) {
      await this.requireResponsavel(dto.responsavelId, tenantId);
    }
    let nextEtapaId = current.funilEtapaId;
    let nextEtapaLabel = current.funilEtapa.label;
    if (dto.funilEtapaId && dto.funilEtapaId !== current.funilEtapaId) {
      const etapa = await this.resolveEtapa(current.funil, dto.funilEtapaId);
      nextEtapaId = etapa.id;
      nextEtapaLabel = etapa.label;
    }

    const historicos: Array<{
      tipo: CaptacaoHistoricoTipo;
      texto: string;
      autorId: string;
    }> = [];
    if (dto.funilEtapaId && dto.funilEtapaId !== current.funilEtapaId) {
      historicos.push({
        tipo: CaptacaoHistoricoTipo.etapa,
        texto: textoEtapa(user.name, current.funilEtapa.label, nextEtapaLabel),
        autorId: user.id,
      });
    }
    if (dto.responsavelId && dto.responsavelId !== current.responsavelId) {
      const novo = await this.prisma.user.findFirst({
        where: { id: dto.responsavelId, tenantId },
        select: { name: true },
      });
      historicos.push({
        tipo: CaptacaoHistoricoTipo.responsavel,
        texto: textoResponsavel(novo?.name ?? user.name),
        autorId: user.id,
      });
    }
    if (
      dto.valorPretendido !== undefined &&
      !moneyEqual(
        toMoneyNumber(current.valorPretendido),
        dto.valorPretendido,
      )
    ) {
      historicos.push({
        tipo: CaptacaoHistoricoTipo.valor,
        texto: textoValorPretendido(),
        autorId: user.id,
      });
    }
    if (
      dto.valorAvaliacao !== undefined &&
      !moneyEqual(toMoneyNumber(current.valorAvaliacao), dto.valorAvaliacao)
    ) {
      historicos.push({
        tipo: CaptacaoHistoricoTipo.valor,
        texto: textoValorAvaliacao(),
        autorId: user.id,
      });
    }
    if (
      typeof dto.exclusividade === 'boolean' &&
      dto.exclusividade !== current.exclusividade
    ) {
      historicos.push({
        tipo: CaptacaoHistoricoTipo.exclusividade,
        texto: textoExclusividade(dto.exclusividade),
        autorId: user.id,
      });
    }
    if (dto.origem != null && dto.origem.trim() !== current.origem) {
      historicos.push({
        tipo: CaptacaoHistoricoTipo.edicao,
        texto: textoEdicao(user.name),
        autorId: user.id,
      });
    }

    const etapaChanged = Boolean(
      dto.funilEtapaId && dto.funilEtapaId !== current.funilEtapaId,
    );
    const nextEtapaFull =
      current.funil.etapas.find((e) => e.id === nextEtapaId) ??
      current.funilEtapa;
    if (etapaChanged && nextEtapaFull.papel === 'perdido') {
      const motivo = dto.motivoPerda?.trim() ?? '';
      if (!motivo) {
        throw new BadRequestException(
          'Selecione o motivo da perda para mover para Perdido.',
        );
      }
      historicos.push({
        tipo: CaptacaoHistoricoTipo.etapa,
        texto: `Perda registrada por ${user.name}: ${motivo}`,
        autorId: user.id,
      });
    }
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
      await tx.captacao.update({
        where: { id },
        data: {
          ...(dto.responsavelId ? { responsavelId: dto.responsavelId } : {}),
          ...(dto.origem != null ? { origem: dto.origem.trim() } : {}),
          ...(typeof dto.exclusividade === 'boolean'
            ? { exclusividade: dto.exclusividade }
            : {}),
          ...(dto.valorPretendido !== undefined
            ? { valorPretendido: dto.valorPretendido }
            : {}),
          ...(dto.valorAvaliacao !== undefined
            ? { valorAvaliacao: dto.valorAvaliacao }
            : {}),
          ...(dto.motivoPerda != null
            ? { motivoPerda: dto.motivoPerda.trim() }
            : {}),
          funilEtapaId: nextEtapaId,
          ...timing,
        },
      });
      if (historicos.length) {
        await tx.captacaoHistorico.createMany({
          data: historicos.map((h) => ({
            tenantId,
            captacaoId: id,
            tipo: h.tipo,
            texto: h.texto,
            autorId: h.autorId,
          })),
        });
      }
    });
    const saved = await this.getCaptacao(id, user);
    if (etapaChanged && nextEtapaFull.papel === 'perdido') {
      await this.agendarRecuperacao(id, dto, user);
    }
    if (etapaChanged && isEtapaCaptada(nextEtapaFull.papel)) {
      await this.disponibilizarCaptacao(id, user);
    }
    return saved;
  }

  async deleteCaptacao(id: string, user: AuthenticatedUser) {
    const tenantId = requireTenantId(user);
    const item = await this.prisma.captacao.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!item) throw new NotFoundException('Captação não encontrada.');
    await this.prisma.captacao.delete({ where: { id } });
  }

  async resumo(user: AuthenticatedUser) {
    const tenantId = requireTenantId(user);
    const [proprietarios, imoveis, captacoes, porEtapa] = await Promise.all([
      this.prisma.proprietario.count({ where: { tenantId } }),
      this.prisma.imovel.count({ where: { tenantId } }),
      this.prisma.captacao.count({ where: { tenantId } }),
      this.prisma.captacao.groupBy({
        by: ['funilEtapaId'],
        where: { tenantId },
        _count: { _all: true },
      }),
    ]);
    let funil: {
      etapas: Array<{
        id: string;
        label: string;
        papel: string | null;
        color: string | null;
        sortOrder: number;
        active: boolean;
      }>;
    } | null = null;
    try {
      funil =
        (await this.funilResolver?.resolve({
          tenantId,
          tipo: FunilTipo.captacao,
          userId: user.id,
        })) ??
        (await this.prisma.funil.findFirst({
          where: { tenantId, tipo: FunilTipo.captacao, ativo: true },
          include: {
            etapas: { orderBy: { sortOrder: 'asc' } },
          },
        }));
    } catch {
      funil = await this.prisma.funil.findFirst({
        where: { tenantId, tipo: FunilTipo.captacao, ativo: true },
        include: {
          etapas: { orderBy: { sortOrder: 'asc' } },
        },
      });
    }
    const etapasAtivas = (funil?.etapas ?? [])
      .filter((etapa) => etapa.active)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
    const etapas = await this.prisma.funilEtapa.findMany({
      where: { id: { in: porEtapa.map((r) => r.funilEtapaId) } },
      select: { id: true, label: true, papel: true, sortOrder: true, color: true },
    });
    const etapaMap = new Map(etapas.map((e) => [e.id, e]));
    let ativas = 0;
    let captados = 0;
    for (const row of porEtapa) {
      const etapa = etapaMap.get(row.funilEtapaId);
      const count = row._count._all;
      if (isEtapaCaptada(etapa?.papel)) captados += count;
      else if (etapa?.papel !== 'perdido') ativas += count;
    }
    const porEtapaOut = etapasAtivas.length
      ? mergeFunilPorEtapa(etapasAtivas, porEtapa)
      : porEtapa
          .map((row) => {
            const etapa = etapaMap.get(row.funilEtapaId);
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
      proprietarios,
      imoveis,
      captacoes,
      captacoesAtivas: ativas,
      imoveisCaptados: captados,
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

  private async requireProprietario(id: string, tenantId: string) {
    const item = await this.prisma.proprietario.findFirst({
      where: { id, tenantId },
    });
    if (!item) {
      throw new BadRequestException(
        'O proprietário não pertence a esta imobiliária.',
      );
    }
    return item;
  }

  private async requireImovel(id: string, tenantId: string) {
    const item = await this.prisma.imovel.findFirst({
      where: { id, tenantId },
    });
    if (!item) {
      throw new BadRequestException('O imóvel não pertence a esta imobiliária.');
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

  private async resolveFunilCaptacao(
    tenantId: string,
    funilId?: string,
    userId?: string,
  ) {
    if (this.funilResolver) {
      return this.funilResolver.resolve({
        tenantId,
        tipo: FunilTipo.captacao,
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
      if (funil.tipo !== FunilTipo.captacao) {
        throw new BadRequestException(
          'A captação só pode usar um funil do tipo Captação.',
        );
      }
      return funil;
    }
    const funil = await this.prisma.funil.findFirst({
      where: { tenantId, tipo: FunilTipo.captacao, ativo: true },
      include: { etapas: true },
    });
    if (!funil) throw new BadRequestException(SEM_FUNIL);
    return funil;
  }

  private async resolveEtapa(
    funil: { id: string; etapas: Array<{ id: string; sortOrder: number; active: boolean; label: string }> },
    funilEtapaId?: string,
  ) {
    if (funilEtapaId) {
      const etapa = funil.etapas.find((e) => e.id === funilEtapaId);
      if (!etapa) {
        throw new BadRequestException(
          'A etapa não pertence ao funil de Captação selecionado.',
        );
      }
      return etapa;
    }
    const first = pickFirstActiveEtapa(funil.etapas);
    if (!first) {
      throw new BadRequestException(
        'O funil de Captação ativo não possui etapas.',
      );
    }
    return first;
  }

  private requireMedia() {
    if (!this.media) {
      throw new ServiceUnavailableException(
        'Upload de imagens indisponível no momento.',
      );
    }
    return this.media;
  }

  private exposeImovel(item: {
    tipo: Prisma.ImovelGetPayload<{ include: typeof imovelInclude }>['tipo'];
    logradouro: string;
    numero: string;
    bairro: string;
    cidade: string;
    area: unknown;
    areaConstruida: unknown;
    captacoes?: Array<{
      id: string;
      valorPretendido?: unknown;
      funilEtapa?: { id: string; label: string; papel?: string | null };
    }>;
    [key: string]: unknown;
  }) {
    const ultima = item.captacoes?.[0];
    const { fotoPublicId: _fotoPublicId, fotos, ...rest } = item;
    const fotosPublicas = Array.isArray(fotos)
      ? (fotos as Array<{ id: string; url: string; sortOrder: number; publicId?: string }>).map(
          ({ publicId: _p, ...foto }) => foto,
        )
      : [];
    return {
      ...rest,
      fotos: fotosPublicas,
      fotoUrl: imovelCapaResolvida({
        id: item.id as string | undefined,
        tipo: item.tipo,
        fotoUrl: item.fotoUrl as string | null | undefined,
        fotos: fotosPublicas,
      }),
      area: toMoneyNumber(item.area as never),
      areaConstruida: toMoneyNumber(item.areaConstruida as never),
      titulo: imovelTitulo(item),
      valor: toMoneyNumber(ultima?.valorPretendido as never),
      captacao: ultima
        ? {
            id: ultima.id,
            etapa: ultima.funilEtapa?.label ?? null,
          }
        : null,
    };
  }

  private exposeCaptacao(item: {
    valorPretendido: unknown;
    valorAvaliacao: unknown;
    imovel: {
      tipo: Prisma.ImovelGetPayload<object>['tipo'];
      logradouro: string;
      numero: string;
      bairro: string;
      cidade: string;
      area: unknown;
      areaConstruida: unknown;
      fotoUrl?: string | null;
      fotoPublicId?: string | null;
      fotos?: Array<{ id: string; url: string; sortOrder: number; publicId?: string }>;
    };
    [key: string]: unknown;
  }) {
    const { fotoPublicId: _fotoPublicId, fotos, ...imovelRest } = item.imovel;
    const fotosPublicas = Array.isArray(fotos)
      ? fotos.map(({ publicId: _p, ...foto }) => foto)
      : [];
    const funil = item.funil as
      | {
          inatividadeValor?: number;
          inatividadeUnidade?: 'minutos' | 'horas' | 'dias';
        }
      | undefined;
    const etapa = item.funilEtapa as
      | {
          papel: 'inicial' | 'analise' | 'venda' | 'captado' | 'perdido' | null;
          prazoValor: number | null;
          prazoUnidade: 'minutos' | 'horas' | 'dias';
          alertaAntecedenciaPercent?: number | null;
        }
      | undefined;
    return {
      ...item,
      valorPretendido: toMoneyNumber(item.valorPretendido as never),
      valorAvaliacao: toMoneyNumber(item.valorAvaliacao as never),
      imovel: {
        ...imovelRest,
        fotos: fotosPublicas,
        fotoUrl: imovelCapaResolvida({
          id: (item.imovel as { id?: string }).id,
          tipo: item.imovel.tipo,
          fotoUrl: item.imovel.fotoUrl,
          fotos: fotosPublicas,
        }),
        area: toMoneyNumber(item.imovel.area as never),
        areaConstruida: toMoneyNumber(item.imovel.areaConstruida as never),
        titulo: imovelTitulo(item.imovel),
      },
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
        idleTitle: 'Captação sem movimentação',
      }),
    };
  }

  async listOportunidades(user: AuthenticatedUser) {
    const tenantId = requireTenantId(user);
    const rows = await this.prisma.oportunidadeCaptacao.findMany({
      where: { tenantId, status: { not: OportunidadeCaptacaoStatus.convertida } },
      include: {
        responsavel: { select: { id: true, name: true } },
        imovel: {
          select: {
            id: true,
            fotoUrl: true,
            fotos: { orderBy: { sortOrder: 'asc' }, take: 1, select: { url: true } },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map((row) => ({
      ...row,
      valorPretendido: toMoneyNumber(row.valorPretendido),
    }));
  }

  async createOportunidade(
    dto: CreateOportunidadeCaptacaoDto,
    user: AuthenticatedUser,
  ) {
    const tenantId = requireTenantId(user);
    await this.requireResponsavel(dto.responsavelId, tenantId);
    const proprietario = await this.prisma.proprietario.create({
      data: {
        tenantId,
        nome: dto.proprietarioNome.trim(),
        telefone: dto.telefone?.trim() ?? '',
      },
    });
    const imovel = await this.prisma.imovel.create({
      data: {
        tenantId,
        proprietarioId: proprietario.id,
        tipo: dto.tipo ?? CaptacaoImovelTipo.outro,
        logradouro: dto.localizacao.trim(),
      },
    });
    const row = await this.prisma.oportunidadeCaptacao.create({
      data: {
        tenantId,
        localizacao: dto.localizacao.trim(),
        proprietarioNome: dto.proprietarioNome.trim(),
        telefone: dto.telefone?.trim() ?? '',
        tipo: dto.tipo ?? CaptacaoImovelTipo.outro,
        valorPretendido: dto.valorPretendido,
        origem: dto.origem?.trim() ?? '',
        responsavelId: dto.responsavelId,
        proximaAcao: dto.proximaAcao?.trim() ?? '',
        proximaAcaoEm: dto.proximaAcaoEm ? new Date(dto.proximaAcaoEm) : null,
        imovelId: imovel.id,
      },
      include: {
        responsavel: { select: { id: true, name: true } },
        imovel: {
          select: {
            id: true,
            fotoUrl: true,
            fotos: { orderBy: { sortOrder: 'asc' }, take: 1, select: { url: true } },
          },
        },
      },
    });
    if (row.proximaAcao) {
      await this.criarTarefaCaptacao(user, {
        titulo: row.proximaAcao,
        responsavelId: row.responsavelId,
        data: dateOnly(row.proximaAcaoEm),
        descricao: `${row.proprietarioNome} · ${row.localizacao}`,
      });
    }
    return { ...row, valorPretendido: toMoneyNumber(row.valorPretendido) };
  }

  async updateOportunidade(
    id: string,
    dto: UpdateOportunidadeCaptacaoDto,
    user: AuthenticatedUser,
  ) {
    const tenantId = requireTenantId(user);
    const current = await this.prisma.oportunidadeCaptacao.findFirst({
      where: { id, tenantId },
    });
    if (!current) throw new NotFoundException('Oportunidade não encontrada.');
    if (current.status !== OportunidadeCaptacaoStatus.aberta) {
      throw new BadRequestException('Esta oportunidade já foi encerrada.');
    }
    if (dto.responsavelId) {
      await this.requireResponsavel(dto.responsavelId, tenantId);
    }
    const row = await this.prisma.oportunidadeCaptacao.update({
      where: { id },
      data: {
        ...(dto.localizacao != null
          ? { localizacao: dto.localizacao.trim() }
          : {}),
        ...(dto.proprietarioNome != null
          ? { proprietarioNome: dto.proprietarioNome.trim() }
          : {}),
        ...(dto.telefone != null ? { telefone: dto.telefone.trim() } : {}),
        ...(dto.tipo ? { tipo: dto.tipo } : {}),
        ...(dto.valorPretendido !== undefined
          ? { valorPretendido: dto.valorPretendido }
          : {}),
        ...(dto.origem != null ? { origem: dto.origem.trim() } : {}),
        ...(dto.responsavelId ? { responsavelId: dto.responsavelId } : {}),
        ...(dto.proximaAcao != null
          ? { proximaAcao: dto.proximaAcao.trim() }
          : {}),
        ...(dto.proximaAcaoEm !== undefined
          ? {
              proximaAcaoEm: dto.proximaAcaoEm
                ? new Date(dto.proximaAcaoEm)
                : null,
            }
          : {}),
      },
      include: { responsavel: { select: { id: true, name: true } } },
    });
    return { ...row, valorPretendido: toMoneyNumber(row.valorPretendido) };
  }

  async perderOportunidade(
    id: string,
    dto: PerderOportunidadeDto,
    user: AuthenticatedUser,
  ) {
    const tenantId = requireTenantId(user);
    const current = await this.prisma.oportunidadeCaptacao.findFirst({
      where: { id, tenantId },
    });
    if (!current) throw new NotFoundException('Oportunidade não encontrada.');
    if (current.status !== OportunidadeCaptacaoStatus.aberta) {
      throw new BadRequestException('Esta oportunidade já foi encerrada.');
    }
    const motivo = assertMotivoPerda(dto.motivoPerda);
    const row = await this.prisma.oportunidadeCaptacao.update({
      where: { id },
      data: { status: OportunidadeCaptacaoStatus.perdida, motivoPerda: motivo },
      include: { responsavel: { select: { id: true, name: true } } },
    });
    await this.criarTarefaCaptacao(user, {
      titulo: `Recuperar oportunidade: ${current.proprietarioNome}`,
      responsavelId: current.responsavelId,
      data: dateOnly(dto.retornoEm ? new Date(dto.retornoEm) : null),
      descricao: `${motivo}. ${current.localizacao}`,
    });
    return { ...row, valorPretendido: toMoneyNumber(row.valorPretendido) };
  }

  async promoverOportunidade(id: string, user: AuthenticatedUser) {
    const tenantId = requireTenantId(user);
    const item = await this.prisma.oportunidadeCaptacao.findFirst({
      where: { id, tenantId },
    });
    if (!item) throw new NotFoundException('Oportunidade não encontrada.');
    if (item.status !== OportunidadeCaptacaoStatus.aberta) {
      throw new BadRequestException('Esta oportunidade já foi encerrada.');
    }
    const digits = item.telefone.replace(/\D/g, '');
    let proprietario = digits
      ? await this.prisma.proprietario.findFirst({
          where: { tenantId, telefone: { contains: digits.slice(-8) } },
        })
      : null;
    if (!proprietario) {
      proprietario = await this.prisma.proprietario.create({
        data: {
          tenantId,
          nome: item.proprietarioNome,
          telefone: item.telefone,
        },
      });
    }
    const local = item.localizacao.trim();
    let imovel = item.imovelId
      ? await this.prisma.imovel.findFirst({
          where: { id: item.imovelId, tenantId },
        })
      : await this.prisma.imovel.findFirst({
      where: {
        tenantId,
        proprietarioId: proprietario.id,
        OR: [
          { logradouro: { equals: local, mode: 'insensitive' } },
          { bairro: { equals: local, mode: 'insensitive' } },
        ],
      },
    });
    if (imovel && imovel.proprietarioId !== proprietario.id) {
      proprietario = await this.prisma.proprietario.findFirstOrThrow({
        where: { id: imovel.proprietarioId, tenantId },
      });
    }
    if (!imovel) {
      imovel = await this.prisma.imovel.create({
        data: {
          tenantId,
          proprietarioId: proprietario.id,
          tipo: item.tipo,
          logradouro: local,
        },
      });
    }
    await this.createCaptacao(
      {
        proprietarioId: proprietario.id,
        imovelId: imovel.id,
        responsavelId: item.responsavelId,
        origem: item.origem,
        valorPretendido: toMoneyNumber(item.valorPretendido) ?? undefined,
      },
      user,
    );
    const captacao = await this.prisma.captacao.findFirst({
      where: { tenantId, imovelId: imovel.id, proprietarioId: proprietario.id },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (!captacao) {
      throw new BadRequestException('A captação não foi aberta.');
    }
    await this.prisma.oportunidadeCaptacao.update({
      where: { id },
      data: {
        status: OportunidadeCaptacaoStatus.convertida,
        captacaoId: captacao.id,
      },
    });
    return this.getCaptacao(captacao.id, user);
  }

  async linhaDoTempoProprietario(id: string, user: AuthenticatedUser) {
    const tenantId = requireTenantId(user);
    const proprietario = await this.prisma.proprietario.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!proprietario) throw new NotFoundException('Proprietário não encontrado.');
    const captacoes = await this.prisma.captacao.findMany({
      where: { tenantId, proprietarioId: id },
      select: { id: true, imovelId: true },
    });
    const captacaoIds = captacoes.map((c) => c.id);
    const imovelIds = captacoes.map((c) => c.imovelId);
    const [historicos, tarefas, visitas, propostas] = await Promise.all([
      this.prisma.captacaoHistorico.findMany({
        where: { tenantId, captacaoId: { in: captacaoIds } },
        orderBy: { createdAt: 'desc' },
        take: 40,
        include: { autor: { select: { name: true } } },
      }),
      this.prisma.tarefa.findMany({
        where: { tenantId, imovelId: { in: imovelIds } },
        orderBy: { createdAt: 'desc' },
        take: 40,
        select: {
          id: true,
          titulo: true,
          status: true,
          data: true,
          createdAt: true,
          responsavel: { select: { name: true } },
        },
      }),
      this.prisma.agendamento.findMany({
        where: { tenantId, imovelId: { in: imovelIds }, tipo: 'visita' },
        orderBy: { startsAt: 'desc' },
        take: 20,
        select: { id: true, titulo: true, startsAt: true },
      }),
      this.prisma.vendaUsadoProposta.findMany({
        where: { tenantId, vendaUsado: { imovelId: { in: imovelIds } } },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { id: true, status: true, valor: true, createdAt: true },
      }),
    ]);
    const eventos = [
      ...historicos.map((h) => ({
        id: h.id,
        tipo: 'registro',
        texto: h.texto,
        quando: h.createdAt,
        autor: h.autor?.name ?? null,
      })),
      ...tarefas.map((t) => ({
        id: t.id,
        tipo: 'tarefa',
        texto: `${t.titulo} · ${t.status}`,
        quando: t.createdAt,
        autor: t.responsavel.name,
      })),
      ...visitas.map((v) => ({
        id: v.id,
        tipo: 'visita',
        texto: v.titulo || 'Visita',
        quando: v.startsAt,
        autor: null as string | null,
      })),
      ...propostas.map((p) => ({
        id: p.id,
        tipo: 'proposta',
        texto: `Proposta ${p.status}`,
        quando: p.createdAt,
        autor: null as string | null,
      })),
    ].sort((a, b) => b.quando.getTime() - a.quando.getTime());
    return eventos;
  }

  async documentacao(user: AuthenticatedUser) {
    const tenantId = requireTenantId(user);
    const rows = await this.prisma.captacao.findMany({
      where: { tenantId, funilEtapa: { papel: { not: 'perdido' } } },
      include: {
        proprietario: { select: { nome: true, telefone: true, cpfCnpj: true } },
        imovel: {
          select: {
            descricao: true,
            cidade: true,
            logradouro: true,
            fotos: { select: { id: true } },
          },
        },
        funilEtapa: { select: { label: true, papel: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map((row) => ({
      id: row.id,
      proprietario: row.proprietario.nome,
      etapa: row.funilEtapa.label,
      itens: checklistDaCaptacao(row),
    }));
  }

  async relatorio(user: AuthenticatedUser) {
    const tenantId = requireTenantId(user);
    const captacoes = await this.prisma.captacao.findMany({
      where: { tenantId },
      select: {
        responsavelId: true,
        motivoPerda: true,
        createdAt: true,
        lastStageChangeAt: true,
        imovelId: true,
        responsavel: { select: { name: true } },
        funilEtapa: { select: { papel: true } },
      },
    });
    const imovelIds = captacoes.map((c) => c.imovelId);
    const visitas = imovelIds.length
      ? await this.prisma.agendamento.groupBy({
          by: ['autorId'],
          where: { tenantId, tipo: 'visita', imovelId: { in: imovelIds } },
          _count: { _all: true },
        })
      : [];
    const visitasPor = new Map(visitas.map((v) => [v.autorId, v._count._all]));
    const porCorretor = new Map<
      string,
      {
        responsavelId: string;
        nome: string;
        abertas: number;
        concluidas: number;
        visitas: number;
        dias: number[];
      }
    >();
    const motivos = new Map<string, number>();
    for (const item of captacoes) {
      const bucket = porCorretor.get(item.responsavelId) ?? {
        responsavelId: item.responsavelId,
        nome: item.responsavel.name,
        abertas: 0,
        concluidas: 0,
        visitas: visitasPor.get(item.responsavelId) ?? 0,
        dias: [],
      };
      if (item.funilEtapa.papel === 'perdido') {
        const motivo = item.motivoPerda.trim() || 'Sem motivo';
        motivos.set(motivo, (motivos.get(motivo) ?? 0) + 1);
      } else if (isEtapaCaptada(item.funilEtapa.papel)) {
        bucket.concluidas += 1;
        const dias = Math.max(
          0,
          Math.round(
            (item.lastStageChangeAt.getTime() - item.createdAt.getTime()) /
              86_400_000,
          ),
        );
        bucket.dias.push(dias);
      } else {
        bucket.abertas += 1;
      }
      porCorretor.set(item.responsavelId, bucket);
    }
    return {
      corretores: [...porCorretor.values()].map((row) => ({
        responsavelId: row.responsavelId,
        nome: row.nome,
        abertas: row.abertas,
        concluidas: row.concluidas,
        visitas: row.visitas,
        tempoMedioDias: row.dias.length
          ? Math.round(row.dias.reduce((a, b) => a + b, 0) / row.dias.length)
          : null,
      })),
      motivos: [...motivos.entries()]
        .map(([motivo, total]) => ({ motivo, total }))
        .sort((a, b) => b.total - a.total),
    };
  }

  private async agendarRecuperacao(
    captacaoId: string,
    dto: UpdateCaptacaoDto,
    user: AuthenticatedUser,
  ) {
    const tenantId = requireTenantId(user);
    const item = await this.prisma.captacao.findFirst({
      where: { id: captacaoId, tenantId },
      include: {
        proprietario: { select: { nome: true } },
        imovel: { select: { id: true } },
      },
    });
    if (!item) return;
    await this.criarTarefaCaptacao(user, {
      titulo: `Recuperar captação: ${item.proprietario.nome}`,
      responsavelId: item.responsavelId,
      data: dateOnly(dto.retornoEm ? new Date(dto.retornoEm) : null),
      descricao: item.motivoPerda || dto.motivoPerda || '',
      imovelId: item.imovel.id,
    });
  }

  private async disponibilizarCaptacao(captacaoId: string, user: AuthenticatedUser) {
    const tenantId = requireTenantId(user);
    const item = await this.prisma.captacao.findFirst({
      where: { id: captacaoId, tenantId },
      include: { imovel: { include: { vendaUsado: true } } },
    });
    if (!item) return;
    const preco =
      toMoneyNumber(item.valorAvaliacao) ?? toMoneyNumber(item.valorPretendido);
    if (item.imovel.vendaUsado) {
      if (preco != null && item.imovel.vendaUsado.precoVenda == null) {
        await this.prisma.vendaUsado.update({
          where: { id: item.imovel.vendaUsado.id },
          data: { precoVenda: preco },
        });
      }
      return;
    }
    const funil = await this.prisma.funil.findFirst({
      where: { tenantId, tipo: FunilTipo.venda_usados, ativo: true },
      include: { etapas: { orderBy: { sortOrder: 'asc' } } },
    });
    const etapa = funil ? pickFirstActiveEtapa(funil.etapas) : null;
    if (!funil || !etapa) {
      await this.prisma.captacaoHistorico.create({
        data: {
          tenantId,
          captacaoId,
          tipo: CaptacaoHistoricoTipo.edicao,
          texto:
            'Captação concluída. O estoque de usados ainda não tem funil ativo, então o imóvel não entrou no estoque.',
          autorId: user.id,
        },
      });
      return;
    }
    await this.prisma.$transaction(async (tx) => {
      const venda = await tx.vendaUsado.create({
        data: {
          tenantId,
          imovelId: item.imovelId,
          responsavelId: item.responsavelId,
          funilId: funil.id,
          funilEtapaId: etapa.id,
          precoVenda: preco,
          ...stageChangeTiming(new Date(), etapa),
          observacoes: 'Disponibilizado ao concluir a captação.',
        },
      });
      await tx.vendaUsadoHistorico.create({
        data: {
          tenantId,
          vendaUsadoId: venda.id,
          tipo: VendaUsadoHistoricoTipo.disponibilizacao,
          texto: `${user.name} concluiu a captação e disponibilizou o imóvel.`,
          autorId: user.id,
        },
      });
    });
  }

  private async criarTarefaCaptacao(
    user: AuthenticatedUser,
    input: {
      titulo: string;
      responsavelId: string;
      data: string;
      descricao: string;
      imovelId?: string;
    },
  ) {
    if (!this.tarefas) return;
    const titulo = input.titulo.trim();
    if (titulo.length < 2) return;
    try {
    await this.tarefas.create(
      {
        titulo: titulo.slice(0, 180),
        data: input.data,
        responsavelId: input.responsavelId,
        tipo: 'ligacao',
        etiqueta: 'captacao',
        descricao: input.descricao,
        imovelId: input.imovelId,
      },
      user,
    );
    } catch {
      /* tarefa é apoio; a perda ou a oportunidade seguem mesmo sem o módulo */
    }
  }
}

function isEtapaCaptada(papel: string | null | undefined) {
  return papel === 'captado' || papel === 'venda';
}

function assertMotivoPerda(value: string) {
  const motivo = value.trim();
  if (
    !CAPTACAO_MOTIVOS_PERDA.includes(
      motivo as (typeof CAPTACAO_MOTIVOS_PERDA)[number],
    )
  ) {
    throw new BadRequestException('Selecione um motivo de perda da lista.');
  }
  return motivo;
}

function dateOnly(value: Date | null | undefined) {
  const base = value && !Number.isNaN(value.getTime()) ? value : addDays(new Date(), 30);
  return base.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function checklistDaCaptacao(row: {
  exclusividade: boolean;
  valorPretendido: Prisma.Decimal | null;
  proprietario: { telefone: string; cpfCnpj: string };
  imovel: {
    descricao: string;
    cidade: string;
    logradouro: string;
    fotos: Array<{ id: string }>;
  };
}) {
  return [
    { chave: 'fotos', label: 'Fotos e vídeos', pronto: row.imovel.fotos.length > 0 },
    {
      chave: 'documentacao',
      label: 'Documentação do proprietário',
      pronto: row.proprietario.cpfCnpj.trim().length > 0,
    },
    {
      chave: 'proprietario',
      label: 'Telefone do proprietário',
      pronto: row.proprietario.telefone.trim().length > 0,
    },
    {
      chave: 'valor',
      label: 'Valor e condições',
      pronto: row.valorPretendido != null,
    },
    {
      chave: 'autorizacao',
      label: 'Autorização para anunciar',
      pronto: row.exclusividade,
    },
    {
      chave: 'portais',
      label: 'Dados para os portais',
      pronto:
        row.imovel.descricao.trim().length > 0 &&
        (row.imovel.cidade.trim().length > 0 ||
          row.imovel.logradouro.trim().length > 0),
    },
  ];
}
