import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { FinanceiroTituloTipo, Role, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { isDeliverableEmail, resolveNotifyEmail } from './mailer.service';
import { MailerService } from './mailer.service';

const TZ = 'America/Sao_Paulo';

function ymd(date: Date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(date);
}

function addDays(day: string, days: number) {
  const [y, m, d] = day.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function formatBr(day: string) {
  const [y, m, d] = day.split('-');
  return `${d}/${m}/${y}`;
}

@Injectable()
export class EmailOpsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmailOpsService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      void this.run().catch((err) => {
        const detail = err instanceof Error ? err.message : 'erro';
        this.logger.warn(`Avisos por e-mail: ${detail}`);
      });
    }, 60 * 60_000);
    setTimeout(() => void this.run().catch(() => undefined), 20_000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async run() {
    if (this.running || !this.mailer.isConfigured()) return;
    this.running = true;
    try {
      await this.mensalidades();
      await this.titulosProximos();
      await this.leadsAtrasados();
    } finally {
      this.running = false;
    }
  }

  private async adminEmails(tenantId: string) {
    const admins = await this.prisma.user.findMany({
      where: { tenantId, role: Role.admin, status: UserStatus.ativo },
      select: { email: true, notifyEmail: true },
    });
    return [
      ...new Set(
        admins
          .map((user) => resolveNotifyEmail(user))
          .filter((email): email is string => Boolean(email)),
      ),
    ];
  }

  private async mensalidades() {
    const today = ymd(new Date());
    const alvo = addDays(today, 3);
    const tenants = await this.prisma.tenant.findMany({
      where: { mensalidadeVencimento: { not: null } },
      select: {
        id: true,
        name: true,
        mensalidadeVencimento: true,
        mensalidadeResponsavelEmail: true,
        mensalidadeAvisoPara: true,
      },
    });
    for (const tenant of tenants) {
      if (!tenant.mensalidadeVencimento) continue;
      const due = ymd(tenant.mensalidadeVencimento);
      if (due !== alvo) continue;
      if (
        tenant.mensalidadeAvisoPara &&
        ymd(tenant.mensalidadeAvisoPara) === due
      ) {
        continue;
      }
      const to = tenant.mensalidadeResponsavelEmail.trim().toLowerCase();
      if (!isDeliverableEmail(to)) continue;
      await this.mailer.sendText({
        to,
        subject: `Mensalidade vence em 3 dias — ${tenant.name}`,
        text: [
          `A mensalidade de ${tenant.name} vence em ${formatBr(due)}.`,
          'Faltam 3 dias para o vencimento.',
        ].join('\n'),
      });
      await this.prisma.tenant.update({
        where: { id: tenant.id },
        data: { mensalidadeAvisoPara: tenant.mensalidadeVencimento },
      });
    }
  }

  private async titulosProximos() {
    const today = ymd(new Date());
    const limite = addDays(today, 3);
    const inicio = new Date(`${addDays(today, -1)}T00:00:00.000Z`);
    const fim = new Date(`${addDays(limite, 1)}T23:59:59.000Z`);
    const titulos = await this.prisma.financeiroTitulo.findMany({
      where: {
        status: 'aberto',
        avisoProximoEnviadoEm: null,
        vencimento: { gte: inicio, lte: fim },
        tenant: { emailOperacional: true, status: UserStatus.ativo },
      },
      select: {
        id: true,
        tenantId: true,
        tipo: true,
        descricao: true,
        valor: true,
        vencimento: true,
        tenant: { select: { name: true } },
      },
      take: 400,
    });
    const porTenant = new Map<string, typeof titulos>();
    for (const titulo of titulos) {
      const day = ymd(titulo.vencimento);
      if (day < today || day > limite) continue;
      const lista = porTenant.get(titulo.tenantId) ?? [];
      lista.push(titulo);
      porTenant.set(titulo.tenantId, lista);
    }
    for (const [tenantId, lista] of porTenant) {
      const tos = await this.adminEmails(tenantId);
      if (tos.length === 0) continue;
      const linhas = lista.slice(0, 30).map((titulo) => {
        const tipo =
          titulo.tipo === FinanceiroTituloTipo.pagar ? 'A pagar' : 'A receber';
        const valor = titulo.valor.toLocaleString('pt-BR', {
          style: 'currency',
          currency: 'BRL',
        });
        return `${tipo}: ${titulo.descricao} — ${valor} — vence ${formatBr(ymd(titulo.vencimento))}`;
      });
      if (lista.length > 30) {
        linhas.push(`E mais ${lista.length - 30} título(s).`);
      }
      const nome = lista[0]?.tenant.name ?? 'Imobiliária';
      for (const to of tos) {
        await this.mailer.sendText({
          to,
          subject: `Contas próximas do vencimento — ${nome}`,
          text: [
            'Estes títulos vencem nos próximos 3 dias:',
            '',
            ...linhas,
          ].join('\n'),
        });
      }
      await this.prisma.financeiroTitulo.updateMany({
        where: { id: { in: lista.map((titulo) => titulo.id) } },
        data: { avisoProximoEnviadoEm: new Date() },
      });
    }
  }

  private async leadsAtrasados() {
    const today = ymd(new Date());
    const tenants = await this.prisma.tenant.findMany({
      where: {
        status: UserStatus.ativo,
        emailOperacional: true,
        leadsAtrasadosLimite: { gt: 0 },
      },
      select: {
        id: true,
        name: true,
        leadsAtrasadosLimite: true,
        leadsAtrasadosAvisoEm: true,
      },
    });
    for (const tenant of tenants) {
      if (
        tenant.leadsAtrasadosAvisoEm &&
        ymd(tenant.leadsAtrasadosAvisoEm) === today
      ) {
        continue;
      }
      const total = await this.prisma.lead.count({
        where: {
          tenantId: tenant.id,
          perdidoAt: null,
          baseFria: false,
          tipo: 'lead',
          roletaPrazoAt: { lt: new Date() },
        },
      });
      if (total < tenant.leadsAtrasadosLimite) continue;
      const tos = await this.adminEmails(tenant.id);
      if (tos.length === 0) continue;
      for (const to of tos) {
        await this.mailer.sendText({
          to,
          subject: `${total} leads atrasados — ${tenant.name}`,
          text: [
            `Há ${total} leads com prazo da fila vencido.`,
            `O aviso está configurado a partir de ${tenant.leadsAtrasadosLimite}.`,
          ].join('\n'),
        });
      }
      await this.prisma.tenant.update({
        where: { id: tenant.id },
        data: { leadsAtrasadosAvisoEm: new Date() },
      });
    }
  }
}
