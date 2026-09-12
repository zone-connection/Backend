import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  MetaEscopo,
  MetaOrigem,
  MetaPeriodo,
  MetaTipo,
  Prisma,
  Role,
  TenantPlano,
  UserStatus,
} from '@prisma/client';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import {
  isStatusVendido,
  documentacaoOperacionalWhere,
  documentacaoVendaNoPeriodoWhere,
} from '../common/utils/documentacao-status';
import { requireTenantId, isPlatformAdmin } from '../common/utils/tenant';
import { isCorretorLike } from '../common/utils/roles';
import { TeamScopeService } from '../equipes/team-scope.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMetaDto } from './dto/create-meta.dto';
import { UpdateMetaDto } from './dto/update-meta.dto';

const BRASIL_UTC_OFFSET_MS = 3 * 60 * 60 * 1000;

const metaInclude = {
  corretor: {
    select: {
      id: true,
      name: true,
      equipeId: true,
      equipe: { select: { id: true, name: true } },
    },
  },
  gerente: {
    select: {
      id: true,
      name: true,
      equipeGerenciada: { select: { id: true, name: true } },
    },
  },
  criador: { select: { id: true, name: true } },
} as const;

type DestinoMeta = {
  escopo: MetaEscopo;
  origem: MetaOrigem;
  corretorId: string | null;
  gerenteId: string | null;
};

@Injectable()
export class MetasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teamScope: TeamScopeService,
  ) {}

  async list(requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);
    const agora = new Date();
    const where = await this.buildListWhere(requester, agora);
    const metas = await this.prisma.meta.findMany({
      where,
      include: metaInclude,
      orderBy: [
        { escopo: 'asc' },
        { periodo: 'asc' },
        { tipo: 'asc' },
        { createdAt: 'desc' },
      ],
    });

    return Promise.all(metas.map((meta) => this.withProgress(meta, tenantId)));
  }

  async create(dto: CreateMetaDto, requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);
    const definicao = this.getDefinicaoPeriodo(dto.periodo);
    const destino = await this.getDestinoCriacao(dto, requester);

    const existente = await this.findExisting(tenantId, destino, dto, definicao.inicio);
    const meta = existente
      ? await this.prisma.meta.update({
          where: { id: existente.id },
          data: {
            valor: dto.valor,
            criadorId: requester.id,
            fim: definicao.fim,
          },
          include: metaInclude,
        })
      : await this.prisma.meta.create({
          data: {
            tenantId,
            escopo: destino.escopo,
            corretorId: destino.corretorId,
            gerenteId: destino.gerenteId,
            criadorId: requester.id,
            origem: destino.origem,
            tipo: dto.tipo as MetaTipo,
            periodo: dto.periodo as MetaPeriodo,
            valor: dto.valor,
            ...definicao,
          },
          include: metaInclude,
        });

    return this.withProgress(meta, tenantId);
  }

  async update(id: string, dto: UpdateMetaDto, requester: AuthenticatedUser) {
    const meta = await this.findEditable(id, requester);
    const updated = await this.prisma.meta.update({
      where: { id: meta.id },
      data: { valor: dto.valor },
      include: metaInclude,
    });
    return this.withProgress(updated, requireTenantId(requester));
  }

  async remove(id: string, requester: AuthenticatedUser) {
    const meta = await this.findEditable(id, requester);
    await this.prisma.meta.delete({ where: { id: meta.id } });
    return { ok: true };
  }

  private async buildListWhere(
    requester: AuthenticatedUser,
    agora: Date,
  ): Promise<Prisma.MetaWhereInput> {
    const tenantId = requireTenantId(requester);
    const base: Prisma.MetaWhereInput = {
      tenantId,
      inicio: { lte: agora },
      fim: { gt: agora },
    };

    if (isPlatformAdmin(requester)) {
      return { ...base, escopo: MetaEscopo.imobiliaria };
    }

    if (String(requester.role) === Role.admin) {
      return base;
    }

    if (isCorretorLike(requester.role)) {
      return {
        ...base,
        OR: [
          { escopo: MetaEscopo.corretor, corretorId: requester.id },
          { escopo: MetaEscopo.imobiliaria },
        ],
      };
    }

    if (requester.role === Role.gerente) {
      const corretorIds =
        (await this.teamScope.getVisibleCorretorIds(requester)) ?? [];
      return {
        ...base,
        OR: [
          {
            escopo: MetaEscopo.corretor,
            corretorId: { in: corretorIds },
          },
          { escopo: MetaEscopo.gerente, gerenteId: requester.id },
          { escopo: MetaEscopo.imobiliaria },
        ],
      };
    }

    throw new ForbiddenException('Sem permissão para visualizar metas.');
  }

  private async findExisting(
    tenantId: string,
    destino: DestinoMeta,
    dto: CreateMetaDto,
    inicio: Date,
  ) {
    return this.prisma.meta.findFirst({
      where: {
        tenantId,
        escopo: destino.escopo,
        origem: destino.origem,
        tipo: dto.tipo as MetaTipo,
        periodo: dto.periodo as MetaPeriodo,
        inicio,
        corretorId: destino.corretorId,
        gerenteId: destino.gerenteId,
      },
      select: { id: true },
    });
  }

  private async getDestinoCriacao(
    dto: CreateMetaDto,
    requester: AuthenticatedUser,
  ): Promise<DestinoMeta> {
    const tenantId = requireTenantId(requester);
    const escopo = (dto.escopo as MetaEscopo | undefined) ?? MetaEscopo.corretor;

    if (isPlatformAdmin(requester)) {
      return {
        escopo: MetaEscopo.imobiliaria,
        origem: MetaOrigem.admin,
        corretorId: null,
        gerenteId: null,
      };
    }

    if (isCorretorLike(requester.role)) {
      if (escopo !== MetaEscopo.corretor) {
        throw new ForbiddenException(
          'Corretores só podem criar metas pessoais.',
        );
      }
      return {
        escopo: MetaEscopo.corretor,
        origem: MetaOrigem.pessoal,
        corretorId: requester.id,
        gerenteId: null,
      };
    }

    if (requester.role === Role.gerente) {
      if (escopo !== MetaEscopo.corretor) {
        throw new ForbiddenException(
          'Gerentes só podem definir metas para corretores da equipe.',
        );
      }
      if (!dto.corretorId) {
        throw new ForbiddenException('Selecione um corretor da sua equipe.');
      }
      if (!(await this.teamScope.canAccessCorretor(requester, dto.corretorId))) {
        throw new ForbiddenException(
          'Você só pode atribuir metas aos corretores da sua equipe.',
        );
      }
      const corretor = await this.prisma.user.findFirst({
        where: {
          id: dto.corretorId,
          tenantId,
          role: { in: [Role.corretor, Role.treinee] },
          status: UserStatus.ativo,
        },
        select: { id: true },
      });
      if (!corretor) {
        throw new NotFoundException('Corretor ativo não encontrado.');
      }
      return {
        escopo: MetaEscopo.corretor,
        origem: MetaOrigem.gerente,
        corretorId: dto.corretorId,
        gerenteId: null,
      };
    }

    if (String(requester.role) !== Role.admin) {
      throw new ForbiddenException(
        'Somente administradores, gerentes e corretores criam metas.',
      );
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { plano: true },
    });
    // Solo: sem escopo de imobiliária/equipe/corretor — meta única do tenant.
    if (tenant?.plano === TenantPlano.solo) {
      return {
        escopo: MetaEscopo.imobiliaria,
        origem: MetaOrigem.admin,
        corretorId: null,
        gerenteId: null,
      };
    }

    if (escopo === MetaEscopo.imobiliaria) {
      return {
        escopo: MetaEscopo.imobiliaria,
        origem: MetaOrigem.admin,
        corretorId: null,
        gerenteId: null,
      };
    }

    if (escopo === MetaEscopo.gerente) {
      if (!dto.gerenteId) {
        throw new ForbiddenException('Selecione o gerente da meta.');
      }
      const gerente = await this.prisma.user.findFirst({
        where: {
          id: dto.gerenteId,
          tenantId,
          role: Role.gerente,
          status: UserStatus.ativo,
        },
        select: { id: true },
      });
      if (!gerente) {
        throw new NotFoundException('Gerente ativo não encontrado.');
      }
      return {
        escopo: MetaEscopo.gerente,
        origem: MetaOrigem.admin,
        corretorId: null,
        gerenteId: dto.gerenteId,
      };
    }

    if (!dto.corretorId) {
      throw new ForbiddenException('Selecione o corretor da meta.');
    }
    const corretor = await this.prisma.user.findFirst({
      where: {
        id: dto.corretorId,
        tenantId,
        role: { in: [Role.corretor, Role.treinee] },
        status: UserStatus.ativo,
      },
      select: { id: true },
    });
    if (!corretor) {
      throw new NotFoundException('Corretor ativo não encontrado.');
    }
    return {
      escopo: MetaEscopo.corretor,
      origem: MetaOrigem.admin,
      corretorId: dto.corretorId,
      gerenteId: null,
    };
  }

  private async findEditable(id: string, requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);
    const meta = await this.prisma.meta.findFirst({
      where: { id, tenantId },
    });
    if (!meta) throw new NotFoundException('Meta não encontrada.');

    if (isPlatformAdmin(requester)) {
      if (meta.escopo !== MetaEscopo.imobiliaria) {
        throw new ForbiddenException(
          'O super admin só edita metas da empresa.',
        );
      }
      return meta;
    }

    if (
      String(requester.role) === Role.admin &&
      meta.origem === MetaOrigem.admin
    ) {
      return meta;
    }

    const podeEditarPessoal =
      isCorretorLike(requester.role) &&
      meta.escopo === MetaEscopo.corretor &&
      meta.corretorId === requester.id &&
      meta.origem === MetaOrigem.pessoal;

    const podeEditarAtribuida =
      requester.role === Role.gerente &&
      meta.escopo === MetaEscopo.corretor &&
      meta.criadorId === requester.id &&
      meta.origem === MetaOrigem.gerente &&
      !!meta.corretorId &&
      (await this.teamScope.canAccessCorretor(requester, meta.corretorId));

    if (!podeEditarPessoal && !podeEditarAtribuida) {
      throw new ForbiddenException('Você não pode alterar esta meta.');
    }
    return meta;
  }

  private getDefinicaoPeriodo(periodo: string) {
    const dataBrasil = new Date(Date.now() - BRASIL_UTC_OFFSET_MS);
    const ano = dataBrasil.getUTCFullYear();
    const mes = dataBrasil.getUTCMonth();
    const dia = dataBrasil.getUTCDate();
    let inicioLocal: Date;
    let fimLocal: Date;

    if (periodo === MetaPeriodo.diaria) {
      inicioLocal = new Date(Date.UTC(ano, mes, dia));
      fimLocal = new Date(Date.UTC(ano, mes, dia + 1));
    } else if (periodo === MetaPeriodo.semanal) {
      const segunda = dia - ((dataBrasil.getUTCDay() + 6) % 7);
      inicioLocal = new Date(Date.UTC(ano, mes, segunda));
      fimLocal = new Date(Date.UTC(ano, mes, segunda + 7));
    } else if (periodo === MetaPeriodo.trimestral) {
      const mesInicioTrimestre = Math.floor(mes / 3) * 3;
      inicioLocal = new Date(Date.UTC(ano, mesInicioTrimestre, 1));
      fimLocal = new Date(Date.UTC(ano, mesInicioTrimestre + 3, 1));
    } else if (periodo === MetaPeriodo.semestral) {
      const mesInicioSemestre = mes < 6 ? 0 : 6;
      inicioLocal = new Date(Date.UTC(ano, mesInicioSemestre, 1));
      fimLocal = new Date(Date.UTC(ano, mesInicioSemestre + 6, 1));
    } else if (periodo === MetaPeriodo.anual) {
      inicioLocal = new Date(Date.UTC(ano, 0, 1));
      fimLocal = new Date(Date.UTC(ano + 1, 0, 1));
    } else {
      // mensal (padrão)
      inicioLocal = new Date(Date.UTC(ano, mes, 1));
      fimLocal = new Date(Date.UTC(ano, mes + 1, 1));
    }

    return {
      inicio: new Date(inicioLocal.getTime() + BRASIL_UTC_OFFSET_MS),
      fim: new Date(fimLocal.getTime() + BRASIL_UTC_OFFSET_MS),
    };
  }

  /**
   * IDs cujas vendas contam na meta.
   * `null` = imobiliária: todas as vendas do tenant (alinhado à tela Vendas).
   */
  private async resolveCorretorIdsForMeta(meta: {
    escopo: MetaEscopo;
    corretorId: string | null;
    gerenteId: string | null;
    tenantId?: string;
  }, tenantId: string): Promise<string[] | null> {
    if (meta.escopo === MetaEscopo.corretor) {
      return meta.corretorId ? [meta.corretorId] : [];
    }
    if (meta.escopo === MetaEscopo.gerente) {
      if (!meta.gerenteId) return [];
      const equipe = await this.prisma.equipe.findFirst({
        where: { tenantId, gerenteId: meta.gerenteId },
        select: {
          membros: {
            where: {
              role: { in: [Role.corretor, Role.treinee] },
              status: UserStatus.ativo,
            },
            select: { id: true },
          },
        },
      });
      const memberIds = equipe?.membros.map((m) => m.id) ?? [];
      // Inclui o próprio gerente (vendas creditadas a ele)
      return Array.from(new Set([meta.gerenteId, ...memberIds]));
    }
    // imobiliaria → todo o tenant (admin/gerente/corretor/treinee)
    return null;
  }

  private async withProgress<
    T extends {
      escopo: MetaEscopo;
      corretorId: string | null;
      gerenteId: string | null;
      tipo: MetaTipo;
      inicio: Date;
      fim: Date;
      valor: number;
    },
  >(meta: T, tenantId: string) {
    // null = escopo imobiliária: todas as vendas do tenant
    const corretorIds = await this.resolveCorretorIdsForMeta(meta, tenantId);
    let atual = 0;

    if (corretorIds !== null && corretorIds.length === 0) {
      return {
        ...meta,
        atual: 0,
        percentual: 0,
      };
    }

    const creditedTo =
      corretorIds === null
        ? {}
        : {
            OR: [
              { corretorId: { in: corretorIds } },
              { lead: { corretorId: { in: corretorIds } } },
            ],
          };

    if (meta.tipo === MetaTipo.documentacoes) {
      atual = await this.prisma.documentacao.count({
        where: {
          tenantId,
          createdAt: { gte: meta.inicio, lt: meta.fim },
          AND: [documentacaoOperacionalWhere()],
          ...(corretorIds === null
            ? {}
            : { corretorId: { in: corretorIds } }),
        },
      });
    } else if (meta.tipo === MetaTipo.vendas) {
      const docs = await this.prisma.documentacao.findMany({
        where: {
          tenantId,
          AND: [
            documentacaoOperacionalWhere(),
            ...(corretorIds === null ? [] : [creditedTo]),
            documentacaoVendaNoPeriodoWhere({
              inicio: meta.inicio,
              fim: meta.fim,
            }),
          ],
        },
        select: { id: true, status2: true },
      });
      const seen = new Set<string>();
      atual = 0;
      for (const doc of docs) {
        if (!isStatusVendido(doc.status2) || seen.has(doc.id)) continue;
        seen.add(doc.id);
        atual += 1;
      }
    } else {
      const docsVgv = await this.prisma.documentacao.findMany({
        where: {
          tenantId,
          AND: [
            documentacaoOperacionalWhere(),
            ...(corretorIds === null ? [] : [creditedTo]),
            documentacaoVendaNoPeriodoWhere({
              inicio: meta.inicio,
              fim: meta.fim,
            }),
          ],
        },
        select: { status2: true, vgv: true },
      });
      atual = docsVgv
        .filter((row) => isStatusVendido(row.status2))
        .reduce((total, row) => total + (row.vgv ?? 0), 0);
    }

    return {
      ...meta,
      atual,
      percentual: Math.min(100, Math.round((atual / meta.valor) * 100)),
    };
  }
}
