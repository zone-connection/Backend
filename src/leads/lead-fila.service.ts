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
  FunilTipo,
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

const ELEGIVEIS: Role[] = [Role.corretor, Role.gerente, Role.treinee];
const ROLETA_INTERVAL_MS = 30_000;

function houveMovimentoDepois(
  marcos: Array<Date | null | undefined>,
  desde: Date,
) {
  return marcos.some((marco) => marco != null && marco.getTime() > desde.getTime());
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
      (m) => m.ativo && m.user.status === UserStatus.ativo,
    );
    const proximo = ativos[0] ?? null;
    const cargoCount = { corretor: 0, gerente: 0, treinee: 0 };
    for (const row of porCargo) {
      const membro = membros.find((m) => m.userId === row.userId);
      if (!membro) continue;
      if (membro.user.role === Role.corretor) cargoCount.corretor += row._count._all;
      if (membro.user.role === Role.gerente) cargoCount.gerente += row._count._all;
      if (membro.user.role === Role.treinee) cargoCount.treinee += row._count._all;
    }

    return {
      ativa: config.ativa,
      redistribuirMinutos: config.redistribuirMinutos,
      ativos: ativos.length,
      inativos: membros.length - ativos.length,
      distribuidos: atribuidos.length,
      falhas,
      semResponsavel,
      porCargo: cargoCount,
      proximoUserId: proximo?.userId ?? null,
      membros: membros.map((m, index) => ({
        id: m.id,
        userId: m.userId,
        nome: m.user.name,
        avatar: m.user.avatar,
        role: m.user.role,
        cargo: m.user.cargo,
        statusConta: m.user.status,
        ativo: m.ativo && m.user.status === UserStatus.ativo,
        ativoNaFila: m.ativo,
        ordem: index + 1,
        proximo: proximo?.id === m.id,
        recebidos: recebidos.get(m.userId) ?? 0,
        ultimaAtribuicaoAt: m.ultimaAtribuicaoAt,
      })),
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
  ): Promise<Atribuicao & { lead?: { id: string; nome: string; telefone: string; origem: string; cidade: string } }> {
    const locked = await tx.$queryRaw<
      Array<{ id: string; ativa: boolean; redistribuirMinutos: number | null }>
    >`
      SELECT id, ativa, "redistribuirMinutos" FROM lead_fila_configs
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
        corretorId: null,
        filaDistribuidoAt: null,
      },
      select: {
        id: true,
        nome: true,
        telefone: true,
        origem: true,
        cidade: true,
        origemAtrasoLiberacao: true,
      },
    });
    if (!lead) return { assigned: false, motivo: 'nao_elegivel' };

    const membros = await tx.leadFilaMembro.findMany({
      where: {
        configId: config.id,
        ativo: true,
        user: { status: UserStatus.ativo, role: { in: ELEGIVEIS } },
      },
      orderBy: [{ ordem: 'asc' }, { id: 'asc' }],
      include: { user: { select: { id: true, equipeId: true } } },
    });
    const proximo = membros[0];
    if (!proximo) {
      await tx.leadFilaEvento.create({
        data: {
          tenantId: params.tenantId,
          configId: config.id,
          tipo: LeadFilaEventoTipo.sem_participante,
          leadId: lead.id,
          origem: params.origem ?? lead.origem,
          detalhe: 'sem_integrantes_ativos',
        },
      });
      await tx.lead.update({
        where: { id: lead.id },
        data: { filaDistribuidoAt: new Date() },
      });
      return { assigned: false, motivo: 'sem_participante' };
    }

    const agora = new Date();
    const minutos = Number(config.redistribuirMinutos ?? 0);
    const claimed = await tx.lead.updateMany({
      where: { id: lead.id, corretorId: null, filaDistribuidoAt: null },
      data: {
        corretorId: proximo.userId,
        equipeId: proximo.user.equipeId,
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
        userId: proximo.userId,
        origem: params.origem ?? lead.origem,
        detalhe: 'round_robin',
      },
    });
    return {
      assigned: true,
      userId: proximo.userId,
      lead: {
        id: lead.id,
        nome: lead.nome,
        telefone: lead.telefone,
        origem: lead.origem,
        cidade: lead.cidade,
      },
    };
  }

  private async rodarRoleta() {
    if (this.roletaRunning) return;
    this.roletaRunning = true;
    try {
      const moved = await this.processarRoleta();
      if (moved > 0) {
        this.logger.log(`Roleta: ${moved} lead(s) redistribuído(s).`);
      }
    } catch (error) {
      this.logger.error(
        `Roleta falhou: ${error instanceof Error ? error.message : 'erro'}`,
      );
    } finally {
      this.roletaRunning = false;
    }
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
          roletaAtribuidoAt: true,
          filaDistribuidoAt: true,
          lastAtividadeAt: true,
          lastTarefaAt: true,
          lastTriagemAt: true,
          lastStageChangeAt: true,
        },
        take: 40,
        orderBy: { roletaPrazoAt: 'asc' },
      });
      const primeira = new Map<string, string>();
      for (const lead of vencidos) {
        if (!primeira.has(lead.funilId)) {
          const etapa = await this.prisma.funilEtapa.findFirst({
            where: { funilId: lead.funilId, active: true },
            orderBy: { sortOrder: 'asc' },
            select: { slug: true },
          });
          if (etapa) primeira.set(lead.funilId, etapa.slug);
        }
        const desde = lead.roletaAtribuidoAt ?? lead.filaDistribuidoAt ?? now;
        const andou =
          lead.stage !== primeira.get(lead.funilId) ||
          houveMovimentoDepois(
            [
              lead.lastAtividadeAt,
              lead.lastTarefaAt,
              lead.lastTriagemAt,
              lead.lastStageChangeAt,
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
  ): Promise<Atribuicao & { lead?: { id: string; nome: string; telefone: string; origem: string; cidade: string } }> {
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
      },
      select: {
        id: true,
        nome: true,
        telefone: true,
        origem: true,
        cidade: true,
        corretorId: true,
      },
    });
    if (!lead?.corretorId) return { assigned: false, motivo: 'nao_elegivel' };

    const membros = await tx.leadFilaMembro.findMany({
      where: {
        configId: params.configId,
        ativo: true,
        user: { status: UserStatus.ativo, role: { in: ELEGIVEIS } },
      },
      orderBy: [{ ordem: 'asc' }, { id: 'asc' }],
      include: { user: { select: { id: true, equipeId: true } } },
    });
    const proximo = membros.find((m) => m.userId !== lead.corretorId);
    if (!proximo) return { assigned: false, motivo: 'sem_proximo' };

    const prazo = new Date(params.now.getTime() + params.minutos * 60_000);
    const claimed = await tx.lead.updateMany({
      where: { id: lead.id, corretorId: lead.corretorId, roletaPrazoAt: { lte: params.now } },
      data: {
        corretorId: proximo.userId,
        equipeId: proximo.user.equipeId,
        roletaAtribuidoAt: params.now,
        roletaPrazoAt: prazo,
        roletaRedistribuido: true,
      },
    });
    if (claimed.count !== 1) return { assigned: false, motivo: 'ja_atribuido' };

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
        userId: proximo.userId,
        origem: lead.origem,
        detalhe: 'tempo_esgotado',
      },
    });
    return {
      assigned: true,
      userId: proximo.userId,
      lead: {
        id: lead.id,
        nome: lead.nome,
        telefone: lead.telefone,
        origem: lead.origem,
        cidade: lead.cidade,
      },
    };
  }
}

function startOfMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}
