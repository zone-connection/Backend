import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  FinanceiroTituloStatus,
  FinanceiroTituloTipo,
  PlatformContratoStatus,
  PlatformContratoTipo,
  Role,
  UserStatus,
} from '@prisma/client';
import { PLATFORM_TENANT_ID } from '../common/utils/tenant';
import { AccountMailService } from '../mailer/account-mail.service';
import { isDeliverableEmail, resolveNotifyEmail } from '../mailer/mailer.service';
import { PrismaService } from '../prisma/prisma.service';

const DAY_MS = 24 * 60 * 60 * 1000;
const LOOKAHEAD_DAYS = 7;
const TICK_MS = 6 * 60 * 60 * 1000;

@Injectable()
export class AssinaturaAvisosService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AssinaturaAvisosService.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly accountMail: AccountMailService,
  ) {}

  onModuleInit() {
    void this.tick();
    this.timer = setInterval(() => void this.tick(), TICK_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    try {
      await this.avisarVencimento();
      await this.avisarContratoAtrasado();
      await this.avisarTituloAtrasado();
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'erro';
      this.logger.warn(`Avisos de assinatura: ${detail}`);
    }
  }

  private async avisarVencimento() {
    const agora = new Date();
    const limite = new Date(agora.getTime() + LOOKAHEAD_DAYS * DAY_MS);
    const contratos = await this.prisma.platformContrato.findMany({
      where: {
        tipo: PlatformContratoTipo.assinatura,
        status: PlatformContratoStatus.ativo,
        avisoVencimentoEnviadoEm: null,
        vencimento: { gt: agora, lte: limite },
        tenantId: { not: PLATFORM_TENANT_ID },
      },
      select: {
        id: true,
        vencimento: true,
        tenant: { select: { id: true, name: true, email: true } },
      },
      take: 40,
    });
    for (const contrato of contratos) {
      if (!contrato.vencimento) continue;
      const sent = await this.notifyAdmins(contrato.tenant, (to) =>
        this.accountMail.sendPlanEnding({
          to,
          tenantName: contrato.tenant.name,
          vencimento: contrato.vencimento!,
        }),
      );
      if (sent) {
        await this.prisma.platformContrato.update({
          where: { id: contrato.id },
          data: { avisoVencimentoEnviadoEm: new Date() },
        });
      }
    }
  }

  private async avisarContratoAtrasado() {
    const contratos = await this.prisma.platformContrato.findMany({
      where: {
        tipo: PlatformContratoTipo.assinatura,
        status: PlatformContratoStatus.atrasado,
        avisoAtrasoEnviadoEm: null,
        tenantId: { not: PLATFORM_TENANT_ID },
      },
      select: {
        id: true,
        codigo: true,
        valorMensalidade: true,
        vencimento: true,
        tenant: { select: { id: true, name: true, email: true } },
      },
      take: 40,
    });
    for (const contrato of contratos) {
      const sent = await this.notifyAdmins(contrato.tenant, (to) =>
        this.accountMail.sendBillingFailed({
          to,
          tenantName: contrato.tenant.name,
          descricao: `Assinatura ${contrato.codigo} está em atraso.`,
          valor: brl(contrato.valorMensalidade),
          vencimento: contrato.vencimento
            ? formatDate(contrato.vencimento)
            : 'não informado',
        }),
      );
      if (sent) {
        await this.prisma.platformContrato.update({
          where: { id: contrato.id },
          data: { avisoAtrasoEnviadoEm: new Date() },
        });
      }
    }
  }

  private async avisarTituloAtrasado() {
    const titulos = await this.prisma.financeiroTitulo.findMany({
      where: {
        tenantId: PLATFORM_TENANT_ID,
        tipo: FinanceiroTituloTipo.receber,
        status: FinanceiroTituloStatus.atrasado,
        platformContratoId: { not: null },
        avisoAtrasoEnviadoEm: null,
      },
      select: {
        id: true,
        descricao: true,
        valor: true,
        vencimento: true,
        platformContrato: {
          select: {
            tenant: { select: { id: true, name: true, email: true } },
          },
        },
      },
      take: 40,
    });
    for (const titulo of titulos) {
      const tenant = titulo.platformContrato?.tenant;
      if (!tenant || tenant.id === PLATFORM_TENANT_ID) continue;
      const sent = await this.notifyAdmins(tenant, (to) =>
        this.accountMail.sendBillingFailed({
          to,
          tenantName: tenant.name,
          descricao: titulo.descricao,
          valor: brl(titulo.valor),
          vencimento: formatDate(titulo.vencimento),
        }),
      );
      if (sent) {
        await this.prisma.financeiroTitulo.update({
          where: { id: titulo.id },
          data: { avisoAtrasoEnviadoEm: new Date() },
        });
      }
    }
  }

  private async notifyAdmins(
    tenant: { id: string; name: string; email: string },
    send: (to: string) => Promise<void>,
  ): Promise<boolean> {
    const admins = await this.prisma.user.findMany({
      where: {
        tenantId: tenant.id,
        role: Role.admin,
        status: UserStatus.ativo,
      },
      select: { email: true, notifyEmail: true },
    });
    const destinos = new Set<string>();
    for (const admin of admins) {
      const to = resolveNotifyEmail(admin);
      if (to) destinos.add(to);
    }
    const institucional = tenant.email?.trim().toLowerCase();
    if (destinos.size === 0 && isDeliverableEmail(institucional)) {
      destinos.add(institucional);
    }
    if (destinos.size === 0) return false;
    for (const to of destinos) {
      await send(to);
    }
    return true;
  }
}

function brl(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(value);
}
