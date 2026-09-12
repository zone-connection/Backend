import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  AtrasoLiberacaoDestino,
  ContatoTipo,
  FunilTipo,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LeadMonitoramentoService } from './monitoramento/lead-monitoramento.service';
import {
  atrasoStartedAtMs,
  isEtapaTerminal,
  prazoToMs,
} from './monitoramento/prazo.util';

const BATCH = 80;
const INTERVAL_MS = 5 * 60 * 1000;

@Injectable()
export class LeadAtrasoLiberacaoService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LeadAtrasoLiberacaoService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly monitoramento: LeadMonitoramentoService,
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
      const released = await this.processAllTenants();
      if (released > 0) {
        this.logger.log(`Liberação por atraso: ${released} lead(s).`);
      }
    } catch (error) {
      this.logger.error(
        `Liberação por atraso falhou: ${
          error instanceof Error ? error.message : 'erro'
        }`,
      );
    } finally {
      this.running = false;
    }
  }

  async processAllTenants(now = new Date()) {
    const funis = await this.prisma.funil.findMany({
      where: {
        tipo: FunilTipo.comercial,
        ativo: true,
        atrasoLiberacaoAtiva: true,
      },
      select: {
        tenantId: true,
        atrasoLiberacaoDestino: true,
        atrasoLiberacaoValor: true,
        atrasoLiberacaoUnidade: true,
      },
    });

    let released = 0;
    for (const funil of funis) {
      try {
        released += await this.processTenant(funil, now);
      } catch (error) {
        this.logger.error(
          `Liberação por atraso falhou no tenant ${funil.tenantId}: ${
            error instanceof Error ? error.message : 'erro'
          }`,
        );
      }
    }
    return released;
  }

  private async processTenant(
    funil: {
      tenantId: string;
      atrasoLiberacaoDestino: AtrasoLiberacaoDestino;
      atrasoLiberacaoValor: number;
      atrasoLiberacaoUnidade: Parameters<typeof prazoToMs>[1];
    },
    now: Date,
  ) {
    const delayMs = prazoToMs(
      funil.atrasoLiberacaoValor,
      funil.atrasoLiberacaoUnidade,
    );
    const ctx = await this.monitoramento.loadFunilContext(funil.tenantId);
    const nowMs = now.getTime();

    let cursor: string | undefined;
    let released = 0;

    for (;;) {
      const leads = await this.prisma.lead.findMany({
        where: {
          tenantId: funil.tenantId,
          tipo: ContatoTipo.lead,
          perdidoAt: null,
          corretorId: { not: null },
          origemAtrasoLiberacao: null,
        },
        select: {
          id: true,
          stage: true,
          lastMovementAt: true,
          prazoDueAt: true,
        },
        orderBy: { id: 'asc' },
        take: BATCH,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });
      if (leads.length === 0) break;
      cursor = leads[leads.length - 1]!.id;

      const ids: string[] = [];
      for (const lead of leads) {
        const etapa = ctx.etapasBySlug.get(lead.stage);
        const started = atrasoStartedAtMs({
          nowMs,
          terminal: isEtapaTerminal(etapa?.papel),
          prazoDueAt: lead.prazoDueAt,
          lastMovementAt: lead.lastMovementAt,
          inatividadeMs: ctx.inatividadeMs,
        });
        if (started == null) continue;
        if (nowMs - started < delayMs) continue;
        ids.push(lead.id);
      }

      if (ids.length === 0) continue;

      const data: Prisma.LeadUpdateManyMutationInput = {
        corretorId: null,
        equipeId: null,
        origemAtrasoLiberacao: funil.atrasoLiberacaoDestino,
        atrasoLiberadoAt: now,
      };
      const result = await this.prisma.lead.updateMany({
        where: {
          id: { in: ids },
          corretorId: { not: null },
          origemAtrasoLiberacao: null,
          perdidoAt: null,
        },
        data,
      });
      released += result.count;
    }

    return released;
  }
}
