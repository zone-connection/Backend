import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  ContatoTipo,
  FunilTipo,
  Role,
  UserStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PresenceService } from '../presence/presence.service';
import { LeadNotifyService } from '../lead-notify/lead-notify.service';
import { whereNotRetrabalho } from '../equipes/lead-retrabalho.where';

const INTERVAL_MS = 60 * 1000;
const MAX_PER_TENANT = 40;

@Injectable()
export class LeadDistribuicaoAutoService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(LeadDistribuicaoAutoService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly presence: PresenceService,
    private readonly leadNotify: LeadNotifyService,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    void this.safeRun();
    this.timer = setInterval(() => {
      void this.safeRun();
    }, INTERVAL_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async safeRun() {
    if (this.running) return;
    this.running = true;
    try {
      const assigned = await this.processAllTenants();
      if (assigned > 0) {
        this.logger.log(
          `Distribuição automática: ${assigned} lead(s) para corretores online.`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Distribuição automática falhou: ${
          error instanceof Error ? error.message : 'erro'
        }`,
      );
    } finally {
      this.running = false;
    }
  }

  async processAllTenants(now = new Date()): Promise<number> {
    const funis = await this.prisma.funil.findMany({
      where: {
        tipo: FunilTipo.comercial,
        ativo: true,
        distribuicaoAutoAtiva: true,
      },
      select: { tenantId: true },
    });

    let assigned = 0;
    for (const funil of funis) {
      try {
        assigned += await this.processTenant(funil.tenantId, now);
      } catch (error) {
        this.logger.error(
          `Distribuição automática falhou no tenant ${funil.tenantId}: ${
            error instanceof Error ? error.message : 'erro'
          }`,
        );
      }
    }
    return assigned;
  }

  private async processTenant(tenantId: string, now: Date): Promise<number> {
    const corretores = await this.prisma.user.findMany({
      where: {
        tenantId,
        role: { in: [Role.corretor, Role.treinee] },
        status: UserStatus.ativo,
      },
      select: { id: true, equipeId: true },
    });
    if (corretores.length === 0) return 0;

    const onlineIds = new Set(
      await this.presence.listOnlineUserIds(
        tenantId,
        corretores.map((c) => c.id),
      ),
    );
    const online = corretores.filter((c) => onlineIds.has(c.id));
    if (online.length === 0) return 0;

    const pool = await this.prisma.lead.findMany({
      where: {
        tenantId,
        tipo: ContatoTipo.lead,
        perdidoAt: null,
        corretorId: null,
        equipeId: null,
        ...whereNotRetrabalho,
      },
      select: {
        id: true,
        nome: true,
        telefone: true,
        origem: true,
        cidade: true,
      },
      orderBy: { createdAt: 'asc' },
      take: MAX_PER_TENANT,
    });
    if (pool.length === 0) return 0;

    const carteira = await this.prisma.lead.groupBy({
      by: ['corretorId'],
      where: {
        tenantId,
        tipo: ContatoTipo.lead,
        perdidoAt: null,
        corretorId: { in: online.map((c) => c.id) },
      },
      _count: { _all: true },
    });
    const load = new Map(online.map((c) => [c.id, 0]));
    for (const row of carteira) {
      if (row.corretorId) load.set(row.corretorId, row._count._all);
    }

    const byId = new Map(online.map((c) => [c.id, c]));
    const counts = new Map(online.map((c) => [c.id, 0]));
    const firstLead = new Map<string, string>();
    let assigned = 0;

    for (const lead of pool) {
      const nextId = [...load.entries()].sort(
        (a, b) => a[1] - b[1] || a[0].localeCompare(b[0]),
      )[0]?.[0];
      if (!nextId) break;
      const corretor = byId.get(nextId);
      if (!corretor) break;

      await this.prisma.lead.update({
        where: { id: lead.id },
        data: {
          corretorId: corretor.id,
          equipeId: corretor.equipeId,
          origemAtrasoLiberacao: null,
          atrasoLiberadoAt: null,
          lastMovementAt: now,
          prazoDueAt: null,
          alertaProximoAt: null,
        },
      });

      load.set(nextId, (load.get(nextId) ?? 0) + 1);
      counts.set(nextId, (counts.get(nextId) ?? 0) + 1);
      if (!firstLead.has(nextId)) firstLead.set(nextId, lead.id);
      assigned += 1;
    }

    for (const [corretorId, quantidade] of counts) {
      if (quantidade <= 0) continue;
      void this.leadNotify.notifyAssignedBatch({
        tenantId,
        userId: corretorId,
        quantidade,
        leadId: firstLead.get(corretorId) ?? null,
      });
    }

    return assigned;
  }
}
