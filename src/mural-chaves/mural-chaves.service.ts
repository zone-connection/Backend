import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  MuralChaveLocal,
  MuralChaveMovimentoTipo,
  MuralChaveStatus,
  NotificacaoTipo,
  Prisma,
  Role,
  UserStatus,
} from '@prisma/client';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { requireTenantId } from '../common/utils/tenant';
import {
  hasUserAction,
  sanitizeUserPermissions,
} from '../common/utils/user-permissions';
import { PrismaService } from '../prisma/prisma.service';
import {
  ConfirmarDevolucaoMuralChaveDto,
  CreateMuralChaveDto,
  DevolverMuralChaveDto,
  QueryMuralChavesDto,
  RetiradaManualMuralChaveDto,
  RetirarMuralChaveDto,
  UpdateMuralChaveDto,
} from './dto/mural-chave.dto';

const IDENTIFICADOR_RE = /^[\p{L}\p{N}][\p{L}\p{N} ._/\\-]{0,39}$/u;

const RETIRADA_PROPRIA = new Set<Role>([
  Role.admin,
  Role.gerente,
  Role.corretor,
  Role.treinee,
  Role.super_admin,
]);

const chaveInclude = {
  empreendimento: { select: { id: true, nome: true } },
  imovel: {
    select: {
      id: true,
      tipo: true,
      logradouro: true,
      numero: true,
      complemento: true,
      bairro: true,
      cidade: true,
    },
  },
  responsavelAtual: { select: { id: true, name: true } },
  retiradoPor: { select: { id: true, name: true } },
  retiradaRegistradaPor: { select: { id: true, name: true } },
} satisfies Prisma.MuralChaveInclude;

type ChaveRow = Prisma.MuralChaveGetPayload<{ include: typeof chaveInclude }>;

type Vinculo = {
  imovelId: string | null;
  empreendimentoId: string | null;
  unidade: string;
  empreendimentoNome: string;
  imovelLabel: string;
};

const TIPO_LABEL: Record<MuralChaveMovimentoTipo, string> = {
  cadastro: 'Cadastro',
  edicao: 'Alteração',
  identificador: 'Identificador alterado',
  retirada: 'Retirada',
  retirada_manual: 'Retirada manual',
  devolucao: 'Devolução',
  confirmacao: 'Confirmação do corretor',
};

function parseIdentificador(raw: string) {
  const identificador = raw.trim().replace(/\s+/g, ' ');
  if (!IDENTIFICADOR_RE.test(identificador)) {
    throw new BadRequestException(
      'O identificador deve ter de 1 a 40 caracteres (letras, números, espaço, hífen ou barra).',
    );
  }
  return {
    identificador,
    identificadorNorm: identificador.toLocaleUpperCase('pt-BR'),
  };
}

function parseQuando(value: string | undefined, label: string) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException(`${label} inválida.`);
  }
  if (date.getTime() > Date.now() + 60_000) {
    throw new BadRequestException(`${label} não pode estar no futuro.`);
  }
  return date;
}

function labelImovel(
  imovel: ChaveRow['imovel'] | null,
  unidade: string,
) {
  const livre = unidade.trim();
  if (livre) return livre;
  if (!imovel) return '—';
  const endereco = [imovel.logradouro, imovel.numero].filter(Boolean).join(', ');
  const onde = endereco || [imovel.bairro, imovel.cidade].filter(Boolean).join(' · ');
  const tipo = String(imovel.tipo || '').replaceAll('_', ' ');
  return [tipo, onde].filter(Boolean).join(' · ') || 'Imóvel';
}

function comQuem(row: ChaveRow) {
  if (row.status === MuralChaveStatus.em_uso && row.retiradoPor) {
    return `Corretor ${row.retiradoPor.name}`;
  }
  if (row.local === MuralChaveLocal.proprietario) return 'Proprietário';
  if (row.local === MuralChaveLocal.imobiliaria) {
    return row.responsavelAtual
      ? `Imobiliária (${row.responsavelAtual.name})`
      : 'Imobiliária';
  }
  if (row.local === MuralChaveLocal.outro) {
    return row.localDescricao.trim() || 'Outro local';
  }
  if (row.retiradoPor) return `Corretor ${row.retiradoPor.name}`;
  return '—';
}

@Injectable()
export class MuralChavesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: QueryMuralChavesDto, user: AuthenticatedUser) {
    const tenantId = requireTenantId(user);
    const q = query.q?.trim();
    const rows = await this.prisma.muralChave.findMany({
      where: {
        tenantId,
        ...(query.status ? { status: query.status } : {}),
        ...(query.empreendimentoId
          ? { empreendimentoId: query.empreendimentoId }
          : {}),
        ...(q
          ? {
              OR: [
                { identificador: { contains: q, mode: 'insensitive' } },
                { unidade: { contains: q, mode: 'insensitive' } },
                { empreendimento: { nome: { contains: q, mode: 'insensitive' } } },
                { imovel: { logradouro: { contains: q, mode: 'insensitive' } } },
                { retiradoPor: { name: { contains: q, mode: 'insensitive' } } },
              ],
            }
          : {}),
      },
      include: chaveInclude,
    });
    return rows
      .map((row) => this.expose(row))
      .sort((a, b) => {
        if (a.status !== b.status) {
          return a.status === MuralChaveStatus.em_uso ? -1 : 1;
        }
        return a.identificador.localeCompare(b.identificador, 'pt-BR');
      });
  }

  async opcoes(user: AuthenticatedUser) {
    const tenantId = requireTenantId(user);
    const [empreendimentos, imoveis, usuarios] = await Promise.all([
      this.prisma.empreendimento.findMany({
        where: { tenantId, ativo: true },
        select: { id: true, nome: true },
        orderBy: { nome: 'asc' },
        take: 500,
      }),
      this.prisma.imovel.findMany({
        where: { tenantId },
        select: {
          id: true,
          tipo: true,
          logradouro: true,
          numero: true,
          complemento: true,
          bairro: true,
          cidade: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),
      this.prisma.user.findMany({
        where: { tenantId, status: UserStatus.ativo },
        select: { id: true, name: true, role: true },
        orderBy: { name: 'asc' },
      }),
    ]);
    return {
      empreendimentos,
      imoveis: imoveis.map((imovel) => ({
        id: imovel.id,
        label: labelImovel(imovel, ''),
      })),
      usuarios,
    };
  }

  async pendencias(user: AuthenticatedUser) {
    const tenantId = requireTenantId(user);
    const rows = await this.prisma.muralChaveMovimento.findMany({
      where: {
        tenantId,
        tipo: MuralChaveMovimentoTipo.devolucao,
        confirmacaoPendente: true,
        quemDevolveuId: user.id,
      },
      orderBy: { devolucaoEm: 'asc' },
      include: {
        chave: { select: { id: true, identificador: true } },
      },
    });
    return rows.map((row) => ({
      movimentoId: row.id,
      chaveId: row.chaveId,
      identificador: row.chave.identificador,
      empreendimentoNome: row.empreendimentoNome || null,
      imovelLabel: row.imovelLabel || '—',
      devolucaoEm: row.devolucaoEm,
      recebidoPorId: row.quemRecebeuDevolucaoId,
      recebidoPorNome: row.quemRecebeuDevolucaoNome,
    }));
  }

  async historico(id: string, user: AuthenticatedUser) {
    const tenantId = requireTenantId(user);
    await this.requireChave(id, tenantId);
    const rows = await this.prisma.muralChaveMovimento.findMany({
      where: { tenantId, chaveId: id },
      orderBy: { createdAt: 'desc' },
    });
    const anteriores = rows
      .filter((row) => row.tipo === MuralChaveMovimentoTipo.identificador)
      .map((row) => row.identificadorAnterior)
      .filter(Boolean);
    return {
      identificadoresAnteriores: [...new Set(anteriores)],
      itens: rows.map((row) => ({
        id: row.id,
        tipo: row.tipo,
        tipoLabel: TIPO_LABEL[row.tipo],
        manual: row.manual,
        identificador: row.identificador,
        identificadorAnterior: row.identificadorAnterior || null,
        empreendimentoNome: row.empreendimentoNome || null,
        imovelLabel: row.imovelLabel || '—',
        quemRetirouNome: row.quemRetirouNome || null,
        quemRegistrouRetiradaNome: row.quemRegistrouRetiradaNome || null,
        retiradaEm: row.retiradaEm,
        previsaoDevolucao: row.previsaoDevolucao,
        quemDevolveuNome: row.quemDevolveuNome || null,
        quemRecebeuDevolucaoNome: row.quemRecebeuDevolucaoNome || null,
        devolucaoEm: row.devolucaoEm,
        confirmacaoPendente: row.confirmacaoPendente,
        confirmadoEm: row.confirmadoEm,
        confirmadoParaNome: row.confirmadoParaNome || null,
        autorId: row.autorId,
        autorNome: row.autorNome,
        observacao: row.observacao,
        createdAt: row.createdAt,
      })),
    };
  }

  async create(dto: CreateMuralChaveDto, user: AuthenticatedUser) {
    this.assertGerenciar(user);
    const tenantId = requireTenantId(user);
    const id = parseIdentificador(dto.identificador);
    const vinculo = await this.resolveVinculo(tenantId, dto);
    const local = dto.local ?? MuralChaveLocal.imobiliaria;
    this.assertLocalCadastro(local, dto.localDescricao);
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const chave = await tx.muralChave.create({
          data: {
            tenantId,
            ...id,
            imovelId: vinculo.imovelId,
            empreendimentoId: vinculo.empreendimentoId,
            unidade: vinculo.unidade,
            local,
            localDescricao:
              local === MuralChaveLocal.outro ? dto.localDescricao?.trim() ?? '' : '',
            responsavelAtualId:
              local === MuralChaveLocal.imobiliaria ? user.id : null,
            observacoes: dto.observacoes?.trim() ?? '',
          },
          include: chaveInclude,
        });
        await this.writeMovimento(tx, {
          tenantId,
          chave,
          tipo: MuralChaveMovimentoTipo.cadastro,
          autor: user,
          observacao: dto.observacoes?.trim() ?? '',
        });
        return chave;
      });
      return this.expose(created);
    } catch (err) {
      this.rethrowUnique(err);
    }
  }

  async update(id: string, dto: UpdateMuralChaveDto, user: AuthenticatedUser) {
    this.assertGerenciar(user);
    const tenantId = requireTenantId(user);
    const atual = await this.requireChave(id, tenantId);
    const identificadorNovo =
      dto.identificador != null ? parseIdentificador(dto.identificador) : null;
    const mudaIdentificador =
      identificadorNovo != null &&
      (identificadorNovo.identificador !== atual.identificador ||
        identificadorNovo.identificadorNorm !== atual.identificadorNorm);
    if (mudaIdentificador) this.assertIdentificador(user);

    const vinculo = await this.resolveVinculo(tenantId, {
      imovelId: dto.imovelId === undefined ? atual.imovelId : dto.imovelId,
      empreendimentoId:
        dto.empreendimentoId === undefined
          ? atual.empreendimentoId
          : dto.empreendimentoId,
      unidade: dto.unidade === undefined ? atual.unidade : dto.unidade,
    });

    let local = atual.local;
    let localDescricao = atual.localDescricao;
    if (dto.local && dto.local !== atual.local) {
      if (atual.status === MuralChaveStatus.em_uso) {
        throw new BadRequestException(
          'A chave está em uso. Registre a devolução para mudar o local.',
        );
      }
      this.assertLocalCadastro(dto.local, dto.localDescricao ?? atual.localDescricao);
      local = dto.local;
      localDescricao =
        local === MuralChaveLocal.outro
          ? (dto.localDescricao ?? atual.localDescricao).trim()
          : '';
    } else if (dto.localDescricao != null && local === MuralChaveLocal.outro) {
      localDescricao = dto.localDescricao.trim();
      if (!localDescricao) {
        throw new BadRequestException('Informe o local ou o responsável.');
      }
    }

    const identificador = identificadorNovo ?? {
      identificador: atual.identificador,
      identificadorNorm: atual.identificadorNorm,
    };

    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const chave = await tx.muralChave.update({
          where: { id: atual.id },
          data: {
            identificador: identificador.identificador,
            identificadorNorm: identificador.identificadorNorm,
            imovelId: vinculo.imovelId,
            empreendimentoId: vinculo.empreendimentoId,
            unidade: vinculo.unidade,
            local,
            localDescricao,
            ...(local !== atual.local
              ? {
                  responsavelAtualId:
                    local === MuralChaveLocal.imobiliaria ? user.id : null,
                }
              : {}),
            ...(dto.observacoes != null
              ? { observacoes: dto.observacoes.trim() }
              : {}),
          },
          include: chaveInclude,
        });
        if (mudaIdentificador) {
          await this.writeMovimento(tx, {
            tenantId,
            chave,
            tipo: MuralChaveMovimentoTipo.identificador,
            autor: user,
            identificadorAnterior: atual.identificador,
            observacao: `De "${atual.identificador}" para "${chave.identificador}".`,
          });
        }
        const mudouResto =
          vinculo.imovelId !== atual.imovelId ||
          vinculo.empreendimentoId !== atual.empreendimentoId ||
          vinculo.unidade !== atual.unidade ||
          local !== atual.local ||
          localDescricao !== atual.localDescricao ||
          (dto.observacoes != null && dto.observacoes.trim() !== atual.observacoes);
        if (mudouResto) {
          await this.writeMovimento(tx, {
            tenantId,
            chave,
            tipo: MuralChaveMovimentoTipo.edicao,
            autor: user,
            observacao: dto.observacoes?.trim() ?? '',
          });
        }
        return chave;
      });
      return this.expose(updated);
    } catch (err) {
      this.rethrowUnique(err);
    }
  }

  async retirar(id: string, dto: RetirarMuralChaveDto, user: AuthenticatedUser) {
    if (
      !RETIRADA_PROPRIA.has(user.role) &&
      !hasUserAction(user.role, user.permissions, 'muralChaves.gerenciar')
    ) {
      throw new ForbiddenException('Você não pode registrar a retirada desta chave.');
    }
    const tenantId = requireTenantId(user);
    const atual = await this.requireChave(id, tenantId);
    this.assertDisponivel(atual);
    const retiradaEm = new Date();
    const previsao = this.parsePrevisao(dto.previsaoDevolucao, retiradaEm);
    const updated = await this.prisma.$transaction(async (tx) => {
      const chave = await tx.muralChave.update({
        where: { id: atual.id },
        data: {
          status: MuralChaveStatus.em_uso,
          local: MuralChaveLocal.corretor,
          retiradaEm,
          previsaoDevolucao: previsao,
          retiradoPorId: user.id,
          retiradaRegistradaPorId: user.id,
          responsavelAtualId: user.id,
        },
        include: chaveInclude,
      });
      await this.writeMovimento(tx, {
        tenantId,
        chave,
        tipo: MuralChaveMovimentoTipo.retirada,
        autor: user,
        quemRetirou: user,
        quemRegistrou: user,
        retiradaEm,
        previsaoDevolucao: previsao,
        observacao: dto.observacao?.trim() ?? '',
      });
      await this.notifyGestores(tx, {
        tenantId,
        tipo: NotificacaoTipo.chave_retirada,
        titulo: `Chave retirada — ${chave.identificador}`,
        corpo: `${user.name} retirou a chave ${chave.identificador}.`,
        eventoChave: `retirada:${chave.id}:${retiradaEm.toISOString()}`,
        empreendimentoId: chave.empreendimentoId,
      });
      return chave;
    });
    return this.expose(updated);
  }

  async retiradaManual(
    id: string,
    dto: RetiradaManualMuralChaveDto,
    user: AuthenticatedUser,
  ) {
    this.assertGerenciar(user);
    const tenantId = requireTenantId(user);
    const atual = await this.requireChave(id, tenantId);
    this.assertDisponivel(atual);
    const corretor = await this.requireUsuario(dto.corretorId, tenantId);
    const retiradaEm = parseQuando(dto.retiradaEm, 'A data da retirada');
    const previsao = this.parsePrevisao(dto.previsaoDevolucao, retiradaEm);
    const updated = await this.prisma.$transaction(async (tx) => {
      const chave = await tx.muralChave.update({
        where: { id: atual.id },
        data: {
          status: MuralChaveStatus.em_uso,
          local: MuralChaveLocal.corretor,
          retiradaEm,
          previsaoDevolucao: previsao,
          retiradoPorId: corretor.id,
          retiradaRegistradaPorId: user.id,
          responsavelAtualId: corretor.id,
        },
        include: chaveInclude,
      });
      await this.writeMovimento(tx, {
        tenantId,
        chave,
        tipo: MuralChaveMovimentoTipo.retirada_manual,
        manual: true,
        autor: user,
        quemRetirou: corretor,
        quemRegistrou: user,
        retiradaEm,
        previsaoDevolucao: previsao,
        observacao: dto.observacao?.trim() ?? '',
      });
      await this.notifyGestores(tx, {
        tenantId,
        tipo: NotificacaoTipo.chave_retirada,
        titulo: `Retirada registrada — ${chave.identificador}`,
        corpo: `${user.name} registrou que ${corretor.name} está com a chave ${chave.identificador}.`,
        eventoChave: `retirada-manual:${chave.id}:${retiradaEm.toISOString()}`,
        empreendimentoId: chave.empreendimentoId,
      });
      return chave;
    });
    return this.expose(updated);
  }

  async devolver(id: string, dto: DevolverMuralChaveDto, user: AuthenticatedUser) {
    this.assertGerenciar(user);
    const tenantId = requireTenantId(user);
    const atual = await this.requireChave(id, tenantId);
    if (atual.status !== MuralChaveStatus.em_uso || !atual.retiradoPor) {
      throw new BadRequestException('Esta chave não está em uso.');
    }
    this.assertLocalCadastro(dto.local, dto.localDescricao);
    const devolucaoEm = parseQuando(dto.devolucaoEm, 'A data da devolução');
    if (atual.retiradaEm && devolucaoEm < atual.retiradaEm) {
      throw new BadRequestException(
        'A devolução não pode ser anterior à retirada.',
      );
    }
    const corretor = atual.retiradoPor;
    const localDescricao =
      dto.local === MuralChaveLocal.outro ? dto.localDescricao?.trim() ?? '' : '';
    const updated = await this.prisma.$transaction(async (tx) => {
      const chave = await tx.muralChave.update({
        where: { id: atual.id },
        data: {
          status: MuralChaveStatus.disponivel,
          local: dto.local,
          localDescricao,
          responsavelAtualId:
            dto.local === MuralChaveLocal.imobiliaria ? user.id : null,
          retiradaEm: null,
          previsaoDevolucao: null,
          retiradoPorId: null,
          retiradaRegistradaPorId: null,
        },
        include: chaveInclude,
      });
      await this.writeMovimento(tx, {
        tenantId,
        chave,
        tipo: MuralChaveMovimentoTipo.devolucao,
        manual: true,
        autor: user,
        quemDevolveu: corretor,
        quemRecebeu: user,
        devolucaoEm,
        confirmacaoPendente: true,
        observacao: dto.observacao?.trim() ?? '',
        snapshotRetirada: atual,
      });
      await tx.notificacao.create({
        data: {
          tenantId,
          userId: corretor.id,
          tipo: NotificacaoTipo.chave_confirmacao,
          titulo: `Confirme a devolução — ${atual.identificador}`,
          corpo: `${user.name} registrou a devolução da chave ${atual.identificador}. Confirme para quem você entregou.`,
          eventoChave: `confirmacao:${atual.id}:${devolucaoEm.toISOString()}`,
          empreendimentoId: atual.empreendimentoId,
        },
      });
      await this.notifyGestores(tx, {
        tenantId,
        tipo: NotificacaoTipo.chave_devolucao,
        titulo: `Chave devolvida — ${atual.identificador}`,
        corpo: `${user.name} recebeu a chave ${atual.identificador} de ${corretor.name}.`,
        eventoChave: `devolucao:${atual.id}:${devolucaoEm.toISOString()}`,
        empreendimentoId: atual.empreendimentoId,
      });
      return chave;
    });
    return this.expose(updated);
  }

  async confirmar(
    movimentoId: string,
    dto: ConfirmarDevolucaoMuralChaveDto,
    user: AuthenticatedUser,
  ) {
    const tenantId = requireTenantId(user);
    const movimento = await this.prisma.muralChaveMovimento.findFirst({
      where: {
        id: movimentoId,
        tenantId,
        tipo: MuralChaveMovimentoTipo.devolucao,
        confirmacaoPendente: true,
        quemDevolveuId: user.id,
      },
    });
    if (!movimento) {
      throw new NotFoundException('Não há devolução pendente para confirmar.');
    }
    const destino = await this.requireUsuario(dto.entregueParaId, tenantId);
    const chave = await this.requireChave(movimento.chaveId, tenantId);
    const confirmadoEm = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.muralChaveMovimento.update({
        where: { id: movimento.id },
        data: {
          confirmacaoPendente: false,
          confirmadoEm,
          confirmadoParaId: destino.id,
          confirmadoParaNome: destino.name,
        },
      });
      await this.writeMovimento(tx, {
        tenantId,
        chave,
        tipo: MuralChaveMovimentoTipo.confirmacao,
        autor: user,
        quemDevolveu: { id: user.id, name: user.name },
        quemRecebeu: destino,
        devolucaoEm: movimento.devolucaoEm ?? confirmadoEm,
        confirmadoEm,
        observacao: `Confirmou a entrega para ${destino.name}.`,
      });
    });
    return { ok: true };
  }

  private assertGerenciar(user: AuthenticatedUser) {
    if (!hasUserAction(user.role, user.permissions, 'muralChaves.gerenciar')) {
      throw new ForbiddenException(
        'Apenas o responsável pelas chaves pode fazer esta alteração.',
      );
    }
  }

  private assertIdentificador(user: AuthenticatedUser) {
    if (!hasUserAction(user.role, user.permissions, 'muralChaves.identificador')) {
      throw new ForbiddenException(
        'Apenas o administrador pode alterar o identificador da chave.',
      );
    }
  }

  private assertDisponivel(chave: ChaveRow) {
    if (chave.status === MuralChaveStatus.em_uso) {
      const quem = chave.retiradoPor?.name ?? 'outro usuário';
      throw new BadRequestException(`Esta chave já está com ${quem}.`);
    }
  }

  private assertLocalCadastro(local: MuralChaveLocal, descricao?: string | null) {
    if (local === MuralChaveLocal.corretor) {
      throw new BadRequestException(
        'O local "com o corretor" é definido pela retirada da chave.',
      );
    }
    if (local === MuralChaveLocal.outro && !descricao?.trim()) {
      throw new BadRequestException('Informe o local ou o responsável.');
    }
  }

  private parsePrevisao(value: string | undefined, retiradaEm: Date) {
    if (!value?.trim()) return null;
    const previsao = new Date(value);
    if (Number.isNaN(previsao.getTime())) {
      throw new BadRequestException('A previsão de devolução é inválida.');
    }
    if (previsao < retiradaEm) {
      throw new BadRequestException(
        'A previsão de devolução não pode ser anterior à retirada.',
      );
    }
    return previsao;
  }

  private async resolveVinculo(
    tenantId: string,
    dto: {
      imovelId?: string | null;
      empreendimentoId?: string | null;
      unidade?: string | null;
    },
  ): Promise<Vinculo> {
    const imovelId = dto.imovelId?.trim() || null;
    const empreendimentoId = dto.empreendimentoId?.trim() || null;
    const unidade = dto.unidade?.trim() ?? '';
    if (!imovelId && !empreendimentoId) {
      throw new BadRequestException(
        'Vincule a chave a um imóvel, a um empreendimento, ou aos dois.',
      );
    }
    const imovel = imovelId
      ? await this.prisma.imovel.findFirst({
          where: { id: imovelId, tenantId },
          select: chaveInclude.imovel.select,
        })
      : null;
    if (imovelId && !imovel) {
      throw new BadRequestException('Imóvel não encontrado nesta imobiliária.');
    }
    const empreendimento = empreendimentoId
      ? await this.prisma.empreendimento.findFirst({
          where: { id: empreendimentoId, tenantId },
          select: { id: true, nome: true },
        })
      : null;
    if (empreendimentoId && !empreendimento) {
      throw new BadRequestException(
        'Empreendimento não encontrado nesta imobiliária.',
      );
    }
    const imovelLabel = labelImovel(imovel, unidade);
    if (imovelLabel === '—') {
      throw new BadRequestException(
        'Informe a unidade do imóvel (ex.: Apartamento 304).',
      );
    }
    return {
      imovelId,
      empreendimentoId,
      unidade,
      empreendimentoNome: empreendimento?.nome ?? '',
      imovelLabel,
    };
  }

  private async requireChave(id: string, tenantId: string) {
    const item = await this.prisma.muralChave.findFirst({
      where: { id, tenantId },
      include: chaveInclude,
    });
    if (!item) throw new NotFoundException('Chave não encontrada.');
    return item;
  }

  private async requireUsuario(id: string, tenantId: string) {
    const item = await this.prisma.user.findFirst({
      where: { id, tenantId, status: UserStatus.ativo },
      select: { id: true, name: true },
    });
    if (!item) {
      throw new BadRequestException(
        'O usuário deve estar ativo nesta imobiliária.',
      );
    }
    return item;
  }

  private async writeMovimento(
    tx: Prisma.TransactionClient,
    input: {
      tenantId: string;
      chave: ChaveRow;
      tipo: MuralChaveMovimentoTipo;
      autor: { id: string; name: string };
      manual?: boolean;
      identificadorAnterior?: string;
      quemRetirou?: { id: string; name: string } | null;
      quemRegistrou?: { id: string; name: string } | null;
      retiradaEm?: Date | null;
      previsaoDevolucao?: Date | null;
      quemDevolveu?: { id: string; name: string } | null;
      quemRecebeu?: { id: string; name: string } | null;
      devolucaoEm?: Date | null;
      confirmacaoPendente?: boolean;
      confirmadoEm?: Date | null;
      observacao?: string;
      snapshotRetirada?: ChaveRow | null;
    },
  ) {
    const base = input.snapshotRetirada ?? input.chave;
    await tx.muralChaveMovimento.create({
      data: {
        tenantId: input.tenantId,
        chaveId: input.chave.id,
        tipo: input.tipo,
        manual: input.manual ?? false,
        identificador: input.chave.identificador,
        identificadorAnterior: input.identificadorAnterior ?? '',
        imovelId: base.imovelId,
        empreendimentoId: base.empreendimentoId,
        unidade: base.unidade,
        empreendimentoNome: base.empreendimento?.nome ?? '',
        imovelLabel: labelImovel(base.imovel, base.unidade),
        quemRetirouId: input.quemRetirou?.id,
        quemRetirouNome: input.quemRetirou?.name ?? '',
        quemRegistrouRetiradaId: input.quemRegistrou?.id,
        quemRegistrouRetiradaNome: input.quemRegistrou?.name ?? '',
        retiradaEm: input.retiradaEm ?? null,
        previsaoDevolucao: input.previsaoDevolucao ?? null,
        quemDevolveuId: input.quemDevolveu?.id,
        quemDevolveuNome: input.quemDevolveu?.name ?? '',
        quemRecebeuDevolucaoId: input.quemRecebeu?.id,
        quemRecebeuDevolucaoNome: input.quemRecebeu?.name ?? '',
        devolucaoEm: input.devolucaoEm ?? null,
        confirmacaoPendente: input.confirmacaoPendente ?? false,
        confirmadoEm: input.confirmadoEm ?? null,
        confirmadoParaId:
          input.tipo === MuralChaveMovimentoTipo.confirmacao
            ? input.quemRecebeu?.id
            : undefined,
        confirmadoParaNome:
          input.tipo === MuralChaveMovimentoTipo.confirmacao
            ? input.quemRecebeu?.name ?? ''
            : '',
        autorId: input.autor.id,
        autorNome: input.autor.name,
        observacao: input.observacao ?? '',
      },
    });
  }

  private async notifyGestores(
    tx: Prisma.TransactionClient,
    params: {
      tenantId: string;
      tipo: NotificacaoTipo;
      titulo: string;
      corpo: string;
      eventoChave: string;
      empreendimentoId?: string | null;
      exceptId?: string;
    },
  ) {
    const users = await tx.user.findMany({
      where: { tenantId: params.tenantId, status: UserStatus.ativo },
      select: { id: true, role: true, permissions: true },
    });
    const ids = users
      .filter(
        (item) =>
          item.id !== params.exceptId &&
          hasUserAction(
            item.role,
            sanitizeUserPermissions(item.permissions),
            'muralChaves.gerenciar',
          ),
      )
      .map((item) => item.id);
    if (!ids.length) return;
    await tx.notificacao.createMany({
      data: ids.map((userId) => ({
        tenantId: params.tenantId,
        userId,
        tipo: params.tipo,
        titulo: params.titulo,
        corpo: params.corpo,
        eventoChave: params.eventoChave,
        empreendimentoId: params.empreendimentoId ?? null,
      })),
    });
  }

  private rethrowUnique(err: unknown): never {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      throw new BadRequestException(
        'Já existe uma chave com este identificador.',
      );
    }
    throw err;
  }

  private expose(row: ChaveRow) {
    return {
      id: row.id,
      identificador: row.identificador,
      status: row.status,
      statusLabel:
        row.status === MuralChaveStatus.em_uso ? 'Em uso' : 'Disponível',
      local: row.local,
      localDescricao: row.localDescricao,
      comQuem: comQuem(row),
      unidade: row.unidade,
      imovelLabel: labelImovel(row.imovel, row.unidade),
      empreendimento: row.empreendimento,
      imovel: row.imovel
        ? { id: row.imovel.id, label: labelImovel(row.imovel, '') }
        : null,
      responsavelAtual: row.responsavelAtual,
      retiradoPor: row.retiradoPor,
      retiradaRegistradaPor: row.retiradaRegistradaPor,
      retiradaEm: row.retiradaEm,
      previsaoDevolucao: row.previsaoDevolucao,
      observacoes: row.observacoes,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
