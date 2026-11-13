import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  ContatoTipo,
  FunilEtapaPapel,
  FunilTipo,
  LeadAtribuicaoAcao,
  LeadFilaEventoTipo,
  Prisma,
  Role,
  UserStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { requireTenantId } from '../common/utils/tenant';
import { LeadNotifyService } from '../lead-notify/lead-notify.service';
import { dadosAposRedistribuir } from './retrabalho-tag';
import { registrarAtribuicoes } from './lead-atribuicao-historico';

const ELEGIVEIS: Role[] = [Role.corretor, Role.gerente, Role.treinee];
const ROLETA_INTERVAL_MS = 30_000;

type CanalLead = {
  tipo: 'meta' | 'olx' | 'outro';
  chave: string | null;
  rotulo: string;
};

function classificarOrigem(origem: string | null | undefined): CanalLead {
  const texto = (origem ?? '').toLowerCase();
  if (texto.includes('mcmv') && texto.includes('olx')) {
    return { tipo: 'olx', chave: 'olx:mcmv', rotulo: 'MCMV OLX' };
  }
  if (texto.includes('olx')) {
    return { tipo: 'olx', chave: 'olx:grupo', rotulo: 'Grupo OLX' };
  }
  return { tipo: 'outro', chave: null, rotulo: origem?.trim() || 'outro canal' };
}

async function classificarLead(
  tx: Prisma.TransactionClient,
  leadId: string,
  origem: string | null | undefined,
): Promise<CanalLead> {
  const meta = tx.leadMetaLink
    ? await tx.leadMetaLink
        .findUnique({
          where: { leadId },
          select: { campaignId: true, campaignName: true },
        })
        .catch(() => null)
    : null;
  const id = meta?.campaignId?.trim();
  const nome = meta?.campaignName?.trim();
  if (id || nome) {
    return {
      tipo: 'meta',
      chave: id ? `meta:${id}` : `meta:nome:${(nome ?? '').toLowerCase()}`,
      rotulo: nome || id || 'Meta',
    };
  }
  return classificarOrigem(origem);
}

function houveMovimentoDepois(
  marcos: Array<Date | null | undefined>,
  desde: Date,
) {
  const limite = desde.getTime() + 2_000;
  return marcos.some((marco) => marco != null && marco.getTime() > limite);
}

type Atribuicao = {
  assigned: boolean;
  userId?: string;
  motivo?: string;
};

@Injectable()
export class LeadFilaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LeadFilaService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private roletaRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly leadNotify: LeadNotifyService,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    void this.rodarRoleta();
    this.timer = setInterval(() => {
      void this.rodarRoleta();
    }, ROLETA_INTERVAL_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private assertGestor(user: AuthenticatedUser) {
    if (user.role !== Role.admin && user.role !== Role.gerente) {
      throw new ForbiddenException(
        'Somente administrador ou gerente pode gerenciar a fila.',
      );
    }
  }

  private async ensureConfig(tenantId: string) {
    return this.prisma.leadFilaConfig.upsert({
      where: { tenantId },
      create: { tenantId },
      update: {},
    });
  }

  private async syncFunil(tenantId: string, ativa: boolean) {
    await this.prisma.funil.updateMany({
      where: { tenantId, tipo: FunilTipo.comercial, ativo: true },
      data: { distribuicaoAutoAtiva: ativa },
    });
  }

  async painel(user: AuthenticatedUser, de?: string, ate?: string) {
    this.assertGestor(user);
    const tenantId = requireTenantId(user);
    const config = await this.ensureConfig(tenantId);
    const inicio = de ? new Date(de) : startOfMonth();
    const fim = ate ? new Date(ate) : new Date();
    const periodo = { gte: inicio, lte: fim };

    const [membros, atribuidos, falhas, semResponsavel, porCargo] =
      await Promise.all([
        this.prisma.leadFilaMembro.findMany({
          where: { configId: config.id },
          orderBy: { ordem: 'asc' },
          include: {
            campanhas: { orderBy: { nome: 'asc' } },
            equipe: { select: { id: true, name: true, status: true } },
            user: {
              select: {
                id: true,
                name: true,
                role: true,
                status: true,
                avatar: true,
                cargo: true,
              },
            },
          },
        }),
        this.prisma.leadFilaEvento.findMany({
          where: {
            configId: config.id,
            tipo: LeadFilaEventoTipo.atribuicao,
            createdAt: periodo,
          },
          select: { userId: true },
        }),
        this.prisma.leadFilaEvento.count({
          where: {
            configId: config.id,
            tipo: LeadFilaEventoTipo.sem_participante,
            createdAt: periodo,
          },
        }),
        this.prisma.lead.count({
          where: {
            tenantId,
            tipo: ContatoTipo.lead,
            perdidoAt: null,
            corretorId: null,
          },
        }),
        this.prisma.leadFilaEvento.groupBy({
          by: ['userId'],
          where: {
            configId: config.id,
            tipo: LeadFilaEventoTipo.atribuicao,
            createdAt: periodo,
            userId: { not: null },
          },
          _count: { _all: true },
        }),
      ]);

    const recebidos = new Map<string, number>();
    for (const row of atribuidos) {
      if (!row.userId) continue;
      recebidos.set(row.userId, (recebidos.get(row.userId) ?? 0) + 1);
    }

    const ativos = membros.filter(
      (m) =>
        m.ativo &&
        (m.user
          ? m.user.status === UserStatus.ativo
          : m.equipe?.status === UserStatus.ativo),
    );
    const proximoCorretor = ativos.find((m) => m.userId) ?? null;
    const proximoEquipe = ativos.find((m) => m.equipeId && !m.userId) ?? null;
    const cargoCount = { corretor: 0, gerente: 0, treinee: 0 };
    for (const row of porCargo) {
      const membro = membros.find((m) => m.userId && m.userId === row.userId);
      if (!membro?.user) continue;
      if (membro.user.role === Role.corretor) cargoCount.corretor += row._count._all;
      if (membro.user.role === Role.gerente) cargoCount.gerente += row._count._all;
      if (membro.user.role === Role.treinee) cargoCount.treinee += row._count._all;
    }

    return {
      ativa: config.ativa,
      filtroCampanhas: config.filtroCampanhas,
      outrosCanaisNaFila: config.outrosCanaisNaFila,
      redistribuirMinutos: config.redistribuirMinutos,
      ativos: ativos.length,
      inativos: membros.length - ativos.length,
      distribuidos: atribuidos.length,
      falhas,
      semResponsavel,
      porCargo: cargoCount,
      proximoUserId: proximoCorretor?.userId ?? null,
      proximoEquipeId: proximoEquipe?.equipeId ?? null,
      membros: membros.map((m) => {
        const equipe = Boolean(m.equipeId && !m.userId);
        const contaAtiva = m.user
          ? m.user.status === UserStatus.ativo
          : m.equipe?.status === UserStatus.ativo;
        return {
          id: m.id,
          tipo: equipe ? 'equipe' : 'corretor',
          userId: m.userId,
          equipeId: m.equipeId,
          nome: m.user?.name ?? m.equipe?.name ?? 'Equipe',
          avatar: m.user?.avatar ?? null,
          role: m.user?.role ?? 'equipe',
          cargo: m.user?.cargo ?? null,
          statusConta: m.user?.status ?? m.equipe?.status ?? UserStatus.inativo,
          ativo: m.ativo && contaAtiva,
          ativoNaFila: m.ativo,
          ordem: m.ordem,
          proximo: m.userId
            ? proximoCorretor?.id === m.id
            : proximoEquipe?.id === m.id,
          recebidos: m.userId ? (recebidos.get(m.userId) ?? 0) : 0,
          ultimaAtribuicaoAt: m.ultimaAtribuicaoAt,
          campanhas: m.campanhas.map((c) => ({
            chave: c.chave,
            nome: c.nome,
            canal: c.canal,
          })),
        };
      }),
    };
  }

  async historico(user: AuthenticatedUser) {
    this.assertGestor(user);
    const tenantId = requireTenantId(user);
    const config = await this.ensureConfig(tenantId);
    const eventos = await this.prisma.leadFilaEvento.findMany({
      where: { configId: config.id },
      orderBy: { createdAt: 'desc' },
      take: 80,
    });
    const userIds = [
      ...new Set(
        eventos.flatMap((e) => [e.userId, e.actorId].filter(Boolean) as string[]),
      ),
    ];
    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true },
        })
      : [];
    const nomes = new Map(users.map((u) => [u.id, u.name]));
    return eventos.map((e) => ({
      id: e.id,
      tipo: e.tipo,
      leadId: e.leadId,
      origem: e.origem,
      detalhe: e.detalhe,
      createdAt: e.createdAt,
      usuario: e.userId ? nomes.get(e.userId) ?? null : null,
      ator: e.actorId ? nomes.get(e.actorId) ?? null : null,
    }));
  }

  async elegiveis(user: AuthenticatedUser) {
    this.assertGestor(user);
    const tenantId = requireTenantId(user);
    const config = await this.ensureConfig(tenantId);
    const naFila = await this.prisma.leadFilaMembro.findMany({
      where: { configId: config.id },
      select: { userId: true },
    });
    const ids = new Set(naFila.map((m) => m.userId));
    const users = await this.prisma.user.findMany({
      where: {
        tenantId,
        role: { in: ELEGIVEIS },
        status: UserStatus.ativo,
      },
      select: { id: true, name: true, role: true, avatar: true },
      orderBy: { name: 'asc' },
    });
    return users.filter((u) => !ids.has(u.id));
  }

  async setAtiva(user: AuthenticatedUser, ativa: boolean) {
    this.assertGestor(user);
    const tenantId = requireTenantId(user);
    const config = await this.ensureConfig(tenantId);
    await this.prisma.leadFilaConfig.update({
      where: { id: config.id },
      data: { ativa },
    });
    await this.syncFunil(tenantId, ativa);
    await this.prisma.leadFilaEvento.create({
      data: {
        tenantId,
        configId: config.id,
        tipo: ativa ? LeadFilaEventoTipo.ativar : LeadFilaEventoTipo.pausar,
        actorId: user.id,
        detalhe: 'round_robin',
      },
    });
    return { ativa };
  }

  async setRedistribuirMinutos(user: AuthenticatedUser, minutos: number) {
    this.assertGestor(user);
    if (!Number.isInteger(minutos) || minutos < 0 || minutos > 24 * 60) {
      throw new BadRequestException('Informe de 0 a 1440 minutos. Zero desliga a redistribuição.');
    }
    const tenantId = requireTenantId(user);
    const config = await this.ensureConfig(tenantId);
    await this.prisma.leadFilaConfig.update({
      where: { id: config.id },
      data: { redistribuirMinutos: minutos },
    });
    return { redistribuirMinutos: minutos };
  }

  async setFiltros(
    user: AuthenticatedUser,
    filtros: { filtroCampanhas: boolean; outrosCanaisNaFila: boolean },
  ) {
    this.assertGestor(user);
    const tenantId = requireTenantId(user);
    const config = await this.ensureConfig(tenantId);
    await this.prisma.leadFilaConfig.update({
      where: { id: config.id },
      data: filtros,
    });
    return filtros;
  }

  async listarCampanhas(user: AuthenticatedUser) {
    this.assertGestor(user);
    const tenantId = requireTenantId(user);
    const links = await this.prisma.leadMetaLink.findMany({
      where: {
        lead: { tenantId },
        OR: [{ campaignId: { not: null } }, { campaignName: { not: null } }],
      },
      select: { campaignId: true, campaignName: true },
      take: 500,
      orderBy: { createdAt: 'desc' },
    });
    const vistas = new Map<string, { chave: string; nome: string; canal: 'meta' | 'olx' }>();
    for (const link of links) {
      const id = link.campaignId?.trim();
      const nome = link.campaignName?.trim() || id;
      if (!nome) continue;
      const chave = id ? `meta:${id}` : `meta:nome:${nome.toLowerCase()}`;
      if (!vistas.has(chave)) vistas.set(chave, { chave, nome, canal: 'meta' });
    }
    return [
      { chave: 'olx:grupo', nome: 'Grupo OLX', canal: 'olx' as const },
      { chave: 'olx:mcmv', nome: 'MCMV OLX', canal: 'olx' as const },
      ...vistas.values(),
    ];
  }

  async adicionarEquipe(user: AuthenticatedUser, equipeId: string) {
    this.assertGestor(user);
    const tenantId = requireTenantId(user);
    const config = await this.ensureConfig(tenantId);
    const equipe = await this.prisma.equipe.findFirst({
      where: { id: equipeId, tenantId, status: UserStatus.ativo },
    });
    if (!equipe) throw new NotFoundException('Equipe não encontrada.');
    const max = await this.prisma.leadFilaMembro.aggregate({
      where: { configId: config.id, equipeId: { not: null } },
      _max: { ordem: true },
    });
    const membro = await this.prisma.leadFilaMembro.create({
      data: {
        tenantId,
        configId: config.id,
        equipeId,
        ordem: (max._max.ordem ?? 0) + 1,
      },
    });
    await this.prisma.leadFilaEvento.create({
      data: {
        tenantId,
        configId: config.id,
        tipo: LeadFilaEventoTipo.membro_add,
        actorId: user.id,
        detalhe: equipe.name,
      },
    });
    return membro;
  }

  async setCampanhas(
    user: AuthenticatedUser,
    membroId: string,
    campanhas: Array<{ chave: string; nome: string; canal: string }>,
  ) {
    this.assertGestor(user);
    const tenantId = requireTenantId(user);
    const membro = await this.prisma.leadFilaMembro.findFirst({
      where: { id: membroId, tenantId },
    });
    if (!membro) throw new NotFoundException('Integrante não encontrado.');
    const unicas = new Map<string, { chave: string; nome: string; canal: string }>();
    for (const item of campanhas) {
      const chave = item.chave.trim();
      const nome = item.nome.trim();
      if (!chave || !nome) continue;
      if (item.canal !== 'meta' && item.canal !== 'olx') continue;
      unicas.set(chave, { chave, nome, canal: item.canal });
    }
    await this.prisma.leadFilaCampanha.deleteMany({ where: { membroId } });
    if (unicas.size > 0) {
      await this.prisma.leadFilaCampanha.createMany({
        data: [...unicas.values()].map((item) => ({ membroId, ...item })),
      });
    }
    return { ok: true, total: unicas.size };
  }

  async adicionar(user: AuthenticatedUser, userId: string) {
    this.assertGestor(user);
    const tenantId = requireTenantId(user);
    const config = await this.ensureConfig(tenantId);
    const alvo = await this.prisma.user.findFirst({
      where: { id: userId, tenantId, role: { in: ELEGIVEIS } },
    });
    if (!alvo) throw new NotFoundException('Usuário não elegível para a fila.');
    const max = await this.prisma.leadFilaMembro.aggregate({
      where: { configId: config.id },
      _max: { ordem: true },
    });
    const membro = await this.prisma.leadFilaMembro.create({
      data: {
        tenantId,
        configId: config.id,
        userId,
        ordem: (max._max.ordem ?? 0) + 1,
      },
    });
    await this.prisma.leadFilaEvento.create({
      data: {
        tenantId,
        configId: config.id,
        tipo: LeadFilaEventoTipo.membro_add,
        userId,
        actorId: user.id,
      },
    });
    return membro;
  }

  async remover(user: AuthenticatedUser, membroId: string) {
    this.assertGestor(user);
    const tenantId = requireTenantId(user);
    const membro = await this.prisma.leadFilaMembro.findFirst({
      where: { id: membroId, tenantId },
    });
    if (!membro) throw new NotFoundException('Integrante não encontrado.');
    await this.prisma.leadFilaMembro.delete({ where: { id: membro.id } });
    await this.prisma.leadFilaEvento.create({
      data: {
        tenantId,
        configId: membro.configId,
        tipo: LeadFilaEventoTipo.membro_remove,
        userId: membro.userId,
        actorId: user.id,
      },
    });
    return { ok: true };
  }

  async setMembroAtivo(
    user: AuthenticatedUser,
    membroId: string,
    ativo: boolean,
  ) {
    this.assertGestor(user);
    const tenantId = requireTenantId(user);
    const membro = await this.prisma.leadFilaMembro.findFirst({
      where: { id: membroId, tenantId },
    });
    if (!membro) throw new NotFoundException('Integrante não encontrado.');
    await this.prisma.leadFilaMembro.update({
      where: { id: membro.id },
      data: { ativo },
    });
    await this.prisma.leadFilaEvento.create({
      data: {
        tenantId,
        configId: membro.configId,
        tipo: ativo
          ? LeadFilaEventoTipo.membro_ativar
          : LeadFilaEventoTipo.membro_desativar,
        userId: membro.userId,
        actorId: user.id,
      },
    });
    return { ok: true };
  }

  async reordenar(user: AuthenticatedUser, ids: string[]) {
    this.assertGestor(user);
    const tenantId = requireTenantId(user);
    const config = await this.ensureConfig(tenantId);
    const atuais = await this.prisma.leadFilaMembro.findMany({
      where: { configId: config.id },
      select: { id: true },
    });
    const conhecidos = new Set(atuais.map((m) => m.id));
    if (ids.length !== atuais.length || ids.some((id) => !conhecidos.has(id))) {
      throw new BadRequestException('A ordem precisa incluir todos os integrantes.');
    }
    await this.prisma.$transaction(
      ids.map((id, index) =>
        this.prisma.leadFilaMembro.update({
          where: { id },
          data: { ordem: index + 1 },
        }),
      ),
    );
    await this.prisma.leadFilaEvento.create({
      data: {
        tenantId,
        configId: config.id,
        tipo: LeadFilaEventoTipo.reordenar,
        actorId: user.id,
      },
    });
    return { ok: true };
  }

  /**
   * Atribui um lead recém-criado. Idempotente: lead já processado não gira a fila.
   * O SELECT FOR UPDATE na config serializa atribuições simultâneas do tenant.
   */
  async atribuirNovoLead(params: {
    tenantId: string;
    leadId: string;
    origem?: string | null;
  }): Promise<Atribuicao> {
    const result = await this.prisma.$transaction((tx) =>
      this.atribuirNaTransacao(tx, params),
    );
    if (result.assigned && result.userId && result.lead) {
      void this.leadNotify.notifyAssigned({
        tenantId: params.tenantId,
        userId: result.userId,
        lead: result.lead,
      });
    }
    return { assigned: result.assigned, userId: result.userId, motivo: result.motivo };
  }

  async atribuirNaTransacao(
    tx: Prisma.TransactionClient,
    params: { tenantId: string; leadId: string; origem?: string | null },
  ): Promise<Atribuicao & { lead?: { id: string; nome: string; telefone: string; origem: string; cidade: string; interesse?: string | null } }> {
    const locked = await tx.$queryRaw<
      Array<{
        id: string;
        ativa: boolean;
        redistribuirMinutos: number | null;
        filtroCampanhas?: boolean;
        outrosCanaisNaFila?: boolean;
      }>
    >`
      SELECT id, ativa, "redistribuirMinutos",
        "filtroCampanhas", "outrosCanaisNaFila"
      FROM lead_fila_configs
      WHERE "tenantId" = ${params.tenantId}
      FOR UPDATE
    `;
    const config = locked[0];
    if (!config?.ativa) return { assigned: false, motivo: 'fila_inativa' };

    const lead = await tx.lead.findFirst({
      where: {
        id: params.leadId,
        tenantId: params.tenantId,
        tipo: ContatoTipo.lead,
        perdidoAt: null,
        motivoPerda: null,
        origemAtrasoLiberacao: null,
        corretorId: null,
        filaDistribuidoAt: null,
      },
      select: {
        id: true,
        nome: true,
        telefone: true,
        origem: true,
        cidade: true,
        interesse: true,
        origemAtrasoLiberacao: true,
      },
    });
    if (!lead) return { assigned: false, motivo: 'nao_elegivel' };

    const membros = await tx.leadFilaMembro.findMany({
      where: {
        configId: config.id,
        ativo: true,
        OR: [
          { user: { status: UserStatus.ativo, role: { in: ELEGIVEIS } } },
          { equipe: { status: UserStatus.ativo } },
        ],
      },
      orderBy: [{ ordem: 'asc' }, { id: 'asc' }],
      include: {
        user: { select: { id: true, equipeId: true } },
        equipe: { select: { id: true, name: true } },
        campanhas: true,
      },
    });
    const corretores = membros.filter((m) => m.userId && m.user);
    const equipes = membros.filter((m) => m.equipeId && !m.userId);
    const ordem = [...corretores, ...equipes];
    const filtro = Boolean(config.filtroCampanhas);
    const canal = filtro
      ? await classificarLead(tx, lead.id, params.origem ?? lead.origem)
      : null;
    if (filtro && canal?.tipo === 'outro' && !config.outrosCanaisNaFila) {
      await tx.leadFilaEvento.create({
        data: {
          tenantId: params.tenantId,
          configId: config.id,
          tipo: LeadFilaEventoTipo.sem_participante,
          leadId: lead.id,
          origem: params.origem ?? lead.origem,
          detalhe: 'outro_canal_pool_admin',
        },
      });
      await tx.lead.update({
        where: { id: lead.id },
        data: { filaDistribuidoAt: new Date() },
      });
      return { assigned: false, motivo: 'outro_canal' };
    }
    const exigeCampanha = filtro && canal?.tipo !== 'outro';
    const proximo = exigeCampanha
      ? ordem.find((m) =>
          (m.campanhas ?? []).some((c) => c.chave === canal?.chave),
        )
      : ordem[0];
    if (!proximo) {
      await tx.leadFilaEvento.create({
        data: {
          tenantId: params.tenantId,
          configId: config.id,
          tipo: LeadFilaEventoTipo.sem_participante,
          leadId: lead.id,
          origem: params.origem ?? lead.origem,
          detalhe: exigeCampanha
            ? `sem_campanha:${canal?.chave ?? ''}`
            : 'sem_integrantes_ativos',
        },
      });
      await tx.lead.update({
        where: { id: lead.id },
        data: { filaDistribuidoAt: new Date() },
      });
      return { assigned: false, motivo: 'sem_participante' };
    }

    const agora = new Date();
    const paraEquipe = Boolean(proximo.equipeId && !proximo.userId);
    const minutos = Number(config.redistribuirMinutos ?? 0);
    const claimed = await tx.lead.updateMany({
      where: { id: lead.id, corretorId: null, filaDistribuidoAt: null },
      data: {
        corretorId: paraEquipe ? null : proximo.userId,
        equipeId: paraEquipe ? proximo.equipeId : proximo.user?.equipeId ?? null,
        filaDistribuidoAt: agora,
        roletaAtribuidoAt: agora,
        roletaRedistribuido: false,
        roletaPrazoAt:
          minutos > 0 ? new Date(agora.getTime() + minutos * 60_000) : null,
        ...dadosAposRedistribuir({
          retrabalho: false,
          now: agora,
          resetPrazo: true,
        }),
      },
    });
    if (claimed.count !== 1) return { assigned: false, motivo: 'ja_atribuido' };

    await registrarAtribuicoes(tx, [
      {
        tenantId: params.tenantId,
        leadId: lead.id,
        acao: LeadAtribuicaoAcao.roleta,
        toCorretorId: paraEquipe ? null : proximo.userId,
        toEquipeId: paraEquipe ? proximo.equipeId : proximo.user?.equipeId ?? null,
      },
    ]);

    const max = await tx.leadFilaMembro.aggregate({
      where: { configId: config.id },
      _max: { ordem: true },
    });
    await tx.leadFilaMembro.update({
      where: { id: proximo.id },
      data: {
        ordem: (max._max.ordem ?? 0) + 1,
        ultimaAtribuicaoAt: agora,
      },
    });
    await tx.leadFilaEvento.create({
      data: {
        tenantId: params.tenantId,
        configId: config.id,
        tipo: LeadFilaEventoTipo.atribuicao,
        leadId: lead.id,
        userId: proximo.userId ?? undefined,
        origem: params.origem ?? lead.origem,
        detalhe: paraEquipe ? 'round_robin_equipe' : 'round_robin',
      },
    });
    return {
      assigned: true,
      userId: proximo.userId ?? undefined,
      lead: {
        id: lead.id,
        nome: lead.nome,
        telefone: lead.telefone,
        origem: lead.origem,
        cidade: lead.cidade,
        interesse: lead.interesse,
      },
    };
  }

  private async rodarRoleta() {
    if (this.roletaRunning) return;
    this.roletaRunning = true;
    try {
      const encerrados = await this.encerrarEtapaPerda();
      const entradas = await this.processarPool();
      const moved = await this.processarRoleta();
      if (encerrados > 0) {
        this.logger.log(
          `Perda: ${encerrados} lead(s) saíram do funil para Leads perdidos.`,
        );
      }
      if (entradas > 0 || moved > 0) {
        this.logger.log(
          `Roleta: ${entradas} lead(s) novo(s), ${moved} redistribuído(s).`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Roleta falhou: ${error instanceof Error ? error.message : 'erro'}`,
      );
    } finally {
      this.roletaRunning = false;
    }
  }

  /** Quem está na etapa de perda sai do funil e fica em Leads perdidos. */
  async encerrarEtapaPerda(): Promise<number> {
    return this.prisma.$executeRaw`
      UPDATE leads AS l
      SET
        "perdidoAt" = NOW(),
        "motivoPerda" = COALESCE(NULLIF(BTRIM(l."motivoPerda"), ''), 'Perda no funil'),
        "roletaPrazoAt" = NULL,
        "roletaRedistribuido" = false,
        "filaDistribuidoAt" = COALESCE(l."filaDistribuidoAt", NOW())
      FROM funil_etapas AS e
      WHERE l."funilId" = e."funilId"
        AND l.stage = e.slug
        AND l."perdidoAt" IS NULL
        AND (
          e.papel::text = 'perdido'
          OR e.slug = 'perdido'
          OR e.label ILIKE '%perdid%'
          OR e.label ILIKE '%perda%'
        )
    `;
  }

  /**
   * Com a fila ligada, lead sem corretor e sem equipe não fica parado no pool.
   * Entra na roleta no próximo ciclo, mesmo que tenha chegado com a fila pausada.
   */
  async processarPool(): Promise<number> {
    const configs = await this.prisma.leadFilaConfig.findMany({
      where: { ativa: true },
      select: { id: true, tenantId: true },
    });
    let assigned = 0;
    for (const config of configs) {
      const etapasPerda = await this.prisma.funilEtapa.findMany({
        where: {
          funil: { tenantId: config.tenantId },
          OR: [
            { papel: FunilEtapaPapel.perdido },
            { slug: 'perdido' },
            { label: { contains: 'perdid', mode: 'insensitive' } },
            { label: { contains: 'perda', mode: 'insensitive' } },
          ],
        },
        select: { slug: true },
      });
      const slugsPerda = [...new Set(etapasPerda.map((etapa) => etapa.slug))];
      const pendentes = await this.prisma.lead.findMany({
        where: {
          tenantId: config.tenantId,
          tipo: ContatoTipo.lead,
          perdidoAt: null,
          motivoPerda: null,
          origemAtrasoLiberacao: null,
          corretorId: null,
          equipeId: null,
          ...(slugsPerda.length > 0 ? { stage: { notIn: slugsPerda } } : {}),
        },
        select: { id: true, origem: true, filaDistribuidoAt: true },
        orderBy: { createdAt: 'asc' },
        take: 20,
      });
      for (const lead of pendentes) {
        if (lead.filaDistribuidoAt) {
          await this.prisma.lead.updateMany({
            where: { id: lead.id, corretorId: null },
            data: { filaDistribuidoAt: null },
          });
        }
        const result = await this.atribuirNovoLead({
          tenantId: config.tenantId,
          leadId: lead.id,
          origem: lead.origem,
        });
        if (result.assigned) assigned += 1;
      }
    }
    return assigned;
  }

  /** Leads parados na primeira etapa, sem atividade, passam ao próximo da fila. */
  async processarRoleta(now = new Date()): Promise<number> {
    const configs = await this.prisma.leadFilaConfig.findMany({
      where: { ativa: true, redistribuirMinutos: { gt: 0 } },
      select: { id: true, tenantId: true, redistribuirMinutos: true },
    });
    let moved = 0;
    for (const config of configs) {
      const vencidos = await this.prisma.lead.findMany({
        where: {
          tenantId: config.tenantId,
          tipo: ContatoTipo.lead,
          perdidoAt: null,
          corretorId: { not: null },
          filaDistribuidoAt: { not: null },
          roletaPrazoAt: { lte: now },
          motivoPerda: null,
        },
        select: {
          id: true,
          nome: true,
          telefone: true,
          origem: true,
          cidade: true,
          stage: true,
          funilId: true,
          corretorId: true,
          motivoPerda: true,
          roletaAtribuidoAt: true,
          filaDistribuidoAt: true,
          lastAtividadeAt: true,
          lastTarefaAt: true,
          lastTriagemAt: true,
          lastStageChangeAt: true,
          lastMovementAt: true,
        },
        take: 40,
        orderBy: { roletaPrazoAt: 'asc' },
      });
      const funilIds = [...new Set(vencidos.map((lead) => lead.funilId))];
      const etapas = funilIds.length
        ? await this.prisma.funilEtapa.findMany({
            where: { funilId: { in: funilIds }, active: true },
            orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
            select: { funilId: true, slug: true, label: true, papel: true },
          })
        : [];
      const primeira = new Map<string, string>();
      const perdidos = new Map<string, Set<string>>();
      for (const etapa of etapas) {
        if (!primeira.has(etapa.funilId)) {
          const inicial = etapas.find(
            (item) =>
              item.funilId === etapa.funilId &&
              (item.papel === FunilEtapaPapel.inicial ||
                item.slug === 'novo'),
          );
          primeira.set(
            etapa.funilId,
            (inicial ?? etapa).slug,
          );
        }
        const perdido =
          etapa.papel === FunilEtapaPapel.perdido ||
          /perdid|perda/i.test(etapa.label) ||
          etapa.slug === 'perdido';
        if (!perdido) continue;
        const set = perdidos.get(etapa.funilId) ?? new Set<string>();
        set.add(etapa.slug);
        perdidos.set(etapa.funilId, set);
      }
      for (const lead of vencidos) {
        const desde = lead.roletaAtribuidoAt ?? lead.filaDistribuidoAt ?? now;
        const perdeu =
          Boolean(lead.motivoPerda?.trim()) ||
          (perdidos.get(lead.funilId)?.has(lead.stage) ?? false);
        const andou =
          perdeu ||
          lead.stage !== primeira.get(lead.funilId) ||
          houveMovimentoDepois(
            [
              lead.lastAtividadeAt,
              lead.lastTarefaAt,
              lead.lastTriagemAt,
              lead.lastStageChangeAt,
              lead.lastMovementAt,
            ],
            desde,
          );
        if (andou) {
          await this.prisma.lead.update({
            where: { id: lead.id },
            data: { roletaPrazoAt: null, roletaRedistribuido: false },
          });
          continue;
        }
        const result = await this.prisma.$transaction((tx) =>
          this.passarRoleta(tx, {
            tenantId: config.tenantId,
            configId: config.id,
            minutos: config.redistribuirMinutos,
            leadId: lead.id,
            now,
          }),
        );
        if (result.assigned && result.userId && result.lead) {
          moved += 1;
          void this.leadNotify.notifyAssigned({
            tenantId: config.tenantId,
            userId: result.userId,
            lead: result.lead,
          });
        }
      }
      const paradosNaEquipe = await this.prisma.lead.findMany({
        where: {
          tenantId: config.tenantId,
          tipo: ContatoTipo.lead,
          perdidoAt: null,
          corretorId: null,
          equipeId: { not: null },
          roletaPrazoAt: { lte: now },
          motivoPerda: null,
        },
        select: { id: true, origem: true, equipeId: true },
        take: 40,
      });
      for (const lead of paradosNaEquipe) {
        await this.prisma.lead.update({
          where: { id: lead.id },
          data: {
            equipeId: null,
            roletaPrazoAt: null,
            roletaRedistribuido: true,
          },
        });
        await this.prisma.leadFilaEvento.create({
          data: {
            tenantId: config.tenantId,
            configId: config.id,
            tipo: LeadFilaEventoTipo.redistribuicao,
            leadId: lead.id,
            origem: lead.origem,
            detalhe: 'prazo_equipe_pool_admin',
          },
        });
        moved += 1;
      }
    }
    return moved;
  }

  private async passarRoleta(
    tx: Prisma.TransactionClient,
    params: {
      tenantId: string;
      configId: string;
      minutos: number;
      leadId: string;
      now: Date;
    },
  ): Promise<Atribuicao & { lead?: { id: string; nome: string; telefone: string; origem: string; cidade: string; interesse?: string | null } }> {
    await tx.$queryRaw`
      SELECT id FROM lead_fila_configs WHERE id = ${params.configId} FOR UPDATE
    `;
    const lead = await tx.lead.findFirst({
      where: {
        id: params.leadId,
        tenantId: params.tenantId,
        roletaPrazoAt: { lte: params.now },
        corretorId: { not: null },
        perdidoAt: null,
        motivoPerda: null,
        origemAtrasoLiberacao: null,
      },
      select: {
        id: true,
        nome: true,
        telefone: true,
        origem: true,
        cidade: true,
        interesse: true,
        stage: true,
        funilId: true,
        corretorId: true,
        equipeId: true,
      },
    });
    if (!lead?.corretorId) return { assigned: false, motivo: 'nao_elegivel' };
    const etapaPerdida = await tx.funilEtapa.findFirst({
      where: {
        funilId: lead.funilId,
        slug: lead.stage,
        OR: [
          { papel: FunilEtapaPapel.perdido },
          { slug: 'perdido' },
          { label: { contains: 'perdid', mode: 'insensitive' } },
          { label: { contains: 'perda', mode: 'insensitive' } },
        ],
      },
      select: { id: true },
    });
    if (etapaPerdida) {
      await tx.lead.update({
        where: { id: lead.id },
        data: { roletaPrazoAt: null, roletaRedistribuido: false },
      });
      return { assigned: false, motivo: 'perdido' };
    }

    const membros = await tx.leadFilaMembro.findMany({
      where: {
        configId: params.configId,
        ativo: true,
        user: { status: UserStatus.ativo, role: { in: ELEGIVEIS } },
      },
      orderBy: [{ ordem: 'asc' }, { id: 'asc' }],
      include: { user: { select: { id: true, equipeId: true } } },
    });
    const proximo = membros.find(
      (m) => m.userId && m.user && m.userId !== lead.corretorId,
    );
    if (!proximo?.userId || !proximo.user) {
      return { assigned: false, motivo: 'sem_proximo' };
    }
    const destinoId = proximo.userId;
    const destinoEquipeId = proximo.user.equipeId;

    const prazo = new Date(params.now.getTime() + params.minutos * 60_000);
    const claimed = await tx.lead.updateMany({
      where: {
        id: lead.id,
        corretorId: lead.corretorId,
        roletaPrazoAt: { lte: params.now },
        perdidoAt: null,
        motivoPerda: null,
        origemAtrasoLiberacao: null,
      },
      data: {
        corretorId: destinoId,
        equipeId: destinoEquipeId,
        roletaAtribuidoAt: params.now,
        roletaPrazoAt: prazo,
        roletaRedistribuido: true,
      },
    });
    if (claimed.count !== 1) return { assigned: false, motivo: 'ja_atribuido' };

    await registrarAtribuicoes(tx, [
      {
        tenantId: params.tenantId,
        leadId: lead.id,
        acao: LeadAtribuicaoAcao.redistribuicao,
        fromCorretorId: lead.corretorId,
        toCorretorId: destinoId,
        fromEquipeId: lead.equipeId,
        toEquipeId: destinoEquipeId,
      },
    ]);

    const max = await tx.leadFilaMembro.aggregate({
      where: { configId: params.configId },
      _max: { ordem: true },
    });
    await tx.leadFilaMembro.update({
      where: { id: proximo.id },
      data: { ordem: (max._max.ordem ?? 0) + 1, ultimaAtribuicaoAt: params.now },
    });
    await tx.leadFilaEvento.create({
      data: {
        tenantId: params.tenantId,
        configId: params.configId,
        tipo: LeadFilaEventoTipo.redistribuicao,
        leadId: lead.id,
        userId: destinoId,
        origem: lead.origem,
        detalhe: 'tempo_esgotado',
      },
    });
    return {
      assigned: true,
      userId: destinoId,
      lead: {
        id: lead.id,
        nome: lead.nome,
        telefone: lead.telefone,
        origem: lead.origem,
        cidade: lead.cidade,
        interesse: lead.interesse,
      },
    };
  }
}

function startOfMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}
