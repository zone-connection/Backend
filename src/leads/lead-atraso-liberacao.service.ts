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
  NotificacaoTipo,
  Prisma,
  Role,
  TriagemOrigem,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LeadMonitoramentoService } from './monitoramento/lead-monitoramento.service';
import {
  atrasoElegivelParaLiberacao,
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
  private restoredCacaLead = false;

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
      if (!this.restoredCacaLead) {
        await this.restaurarCacaLeadNoFunil();
        this.restoredCacaLead = true;
        return;
      }
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

  /**
   * Caça-lead não desvincula: devolve ao funil quem foi marcado por engano.
   * Recoloca o corretor pela última triagem ou aviso de prazo, quando existir.
   */
  async restaurarCacaLeadNoFunil() {
    const leads = await this.prisma.lead.findMany({
      where: {
        origemAtrasoLiberacao: AtrasoLiberacaoDestino.caca_lead,
        perdidoAt: null,
      },
      select: { id: true, tenantId: true, corretorId: true },
    });
    if (leads.length === 0) return;

    let withOwner = 0;
    for (const lead of leads) {
      let corretorId = lead.corretorId;
      let equipeId: string | null | undefined;
      if (!corretorId) {
        const triagem = await this.prisma.triagemEvent.findFirst({
          where: {
            leadId: lead.id,
            autor: {
              tenantId: lead.tenantId,
              role: { in: [Role.corretor, Role.treinee] },
            },
          },
          orderBy: { createdAt: 'desc' },
          select: {
            autorId: true,
            autor: { select: { equipeId: true } },
          },
        });
        if (triagem) {
          corretorId = triagem.autorId;
          equipeId = triagem.autor.equipeId;
        } else {
          const notif = await this.prisma.notificacao.findFirst({
            where: {
              leadId: lead.id,
              tenantId: lead.tenantId,
              tipo: {
                in: [
                  NotificacaoTipo.lead_prazo_ultrapassado,
                  NotificacaoTipo.lead_sem_atendimento,
                ],
              },
              user: { role: { in: [Role.corretor, Role.treinee] } },
            },
            orderBy: { createdAt: 'desc' },
            select: {
              userId: true,
              user: { select: { equipeId: true } },
            },
          });
          if (notif) {
            corretorId = notif.userId;
            equipeId = notif.user.equipeId;
          }
        }
      }

      await this.prisma.lead.update({
        where: { id: lead.id },
        data: {
          origemAtrasoLiberacao: null,
          atrasoLiberadoAt: null,
          ...(corretorId
            ? {
                corretorId,
                ...(equipeId !== undefined ? { equipeId } : {}),
              }
            : {}),
        },
      });
      if (corretorId) withOwner += 1;
    }

    this.logger.log(
      `Caça-lead: ${leads.length} lead(s) visíveis de novo no funil (${withOwner} com corretor recolocado).`,
    );
  }

  async processAllTenants(now = new Date()) {
    const funis = await this.prisma.funil.findMany({
      where: {
        tipo: FunilTipo.comercial,
        ativo: true,
        atrasoLiberacaoAtiva: true,
        atrasoLiberacaoDestino: AtrasoLiberacaoDestino.retrabalho,
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
    if (funil.atrasoLiberacaoDestino !== AtrasoLiberacaoDestino.retrabalho) {
      return 0;
    }
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
          corretorId: true,
          equipeId: true,
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
        if (
          !atrasoElegivelParaLiberacao({
            nowMs,
            terminal: isEtapaTerminal(etapa?.papel),
            prazoDueAt: lead.prazoDueAt,
            lastMovementAt: lead.lastMovementAt,
            inatividadeMs: ctx.inatividadeMs,
            delayMs,
          })
        ) {
          continue;
        }
        ids.push(lead.id);
      }

      if (ids.length === 0) continue;

      const eligible = leads.filter((lead) => ids.includes(lead.id));
      const data: Prisma.LeadUncheckedUpdateManyInput = {
        corretorId: null,
        equipeId: null,
        origemAtrasoLiberacao: AtrasoLiberacaoDestino.retrabalho,
        atrasoLiberadoAt: now,
      };
      const result = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.lead.updateMany({
          where: {
            id: { in: ids },
            corretorId: { not: null },
            origemAtrasoLiberacao: null,
            perdidoAt: null,
          },
          data,
        });
        if (updated.count > 0) {
          await tx.leadReatribuicao.createMany({
            data: eligible
              .filter((lead) => lead.corretorId)
              .map((lead) => ({
                tenantId: funil.tenantId,
                leadId: lead.id,
                fromCorretorId: lead.corretorId,
                fromEquipeId: lead.equipeId,
                toCorretorId: null,
                toEquipeId: null,
                origem: TriagemOrigem.retrabalho,
              })),
          });
        }
        return updated.count;
      });
      released += result;
    }

    return released;
  }
}
