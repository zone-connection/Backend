import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { OzapApiClient } from '../ozap/ozap-api.client';
import {
  MailerService,
  resolveNotifyEmail,
} from '../mailer/mailer.service';
import {
  DEFAULT_BRAND_LOGO_URL,
  equipePoolCopy,
  formatLeadEmailHtml,
  formatLeadWhatsApp,
  leadAtribuidoCopy,
  leadCrmPath,
  leadLoteCopy,
  leadPoolCopy,
  pickPublicFrontendUrl,
  type LeadNotifySnapshot,
} from './lead-notify.messages';

@Injectable()
export class LeadNotifyService {
  private readonly logger = new Logger(LeadNotifyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificacoes: NotificacoesService,
    private readonly ozapApi: OzapApiClient,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
  ) {}

  /** Lead recém-criado: avisa o corretor dono ou o pool (admin/gerente). */
  async notifyNewLead(params: {
    tenantId: string;
    lead: LeadNotifySnapshot & { corretorId: string | null };
    actorUserId?: string | null;
  }): Promise<void> {
    try {
      if (
        params.lead.corretorId &&
        params.lead.corretorId !== params.actorUserId
      ) {
        await this.notifyAssigned({
          tenantId: params.tenantId,
          userId: params.lead.corretorId,
          lead: params.lead,
        });
        return;
      }
      if (!params.lead.corretorId) {
        await this.notifyPoolManagers({
          tenantId: params.tenantId,
          lead: params.lead,
          actorUserId: params.actorUserId,
        });
      }
    } catch (error) {
      this.logger.error(
        `Falha ao notificar novo lead ${params.lead.id}: ${
          error instanceof Error ? error.message : 'erro'
        }`,
      );
    }
  }

  async notifyAssigned(params: {
    tenantId: string;
    userId: string;
    lead: LeadNotifySnapshot;
  }): Promise<void> {
    const copy = leadAtribuidoCopy(params.lead);
    await this.notificacoes.createLeadAtribuido({
      userId: params.userId,
      leadId: params.lead.id,
      titulo: copy.titulo,
      corpo: copy.corpo,
      eventoChave: `lead_atribuido:${params.lead.id}`,
    });
    this.queueOutbound({
      tenantId: params.tenantId,
      userId: params.userId,
      subject: copy.titulo,
      text: formatLeadWhatsApp({
        titulo: copy.whatsappTitulo,
        lead: params.lead,
        crmUrl: this.crmUrl(params.lead.id),
      }),
      email: {
        titulo: copy.whatsappTitulo,
        lead: params.lead,
        crmUrl: this.crmUrl(params.lead.id),
      },
    });
  }

  async notifyAssignedBatch(params: {
    tenantId: string;
    userId: string;
    quantidade: number;
    leadId?: string | null;
    actorUserId?: string | null;
  }): Promise<void> {
    if (params.quantidade <= 0 || params.userId === params.actorUserId) return;
    const copy = leadLoteCopy(params.quantidade);
    await this.notificacoes.createLeadAtribuido({
      userId: params.userId,
      leadId: params.leadId ?? null,
      titulo: copy.titulo,
      corpo: copy.corpo,
      eventoChave: `lead_atribuido_lote:${params.userId}:${params.leadId ?? 'lote'}:${params.quantidade}`,
    });
    this.queueOutbound({
      tenantId: params.tenantId,
      userId: params.userId,
      subject: copy.titulo,
      text: formatLeadWhatsApp({
        titulo: copy.whatsappTitulo,
        extra: copy.corpo,
        crmUrl: this.crmUrl(params.leadId),
      }),
      email: {
        titulo: copy.whatsappTitulo,
        extra: copy.corpo,
        crmUrl: this.crmUrl(params.leadId),
      },
    });
  }

  async notifyTeamPool(params: {
    tenantId: string;
    gerenteId: string;
    quantidade: number;
    equipeNome?: string | null;
    leadId?: string | null;
    actorUserId?: string | null;
  }): Promise<void> {
    if (params.quantidade <= 0 || params.gerenteId === params.actorUserId) {
      return;
    }
    const copy = equipePoolCopy(params.quantidade, params.equipeNome);
    await this.notificacoes.createLeadPool({
      userId: params.gerenteId,
      leadId: params.leadId ?? null,
      titulo: copy.titulo,
      corpo: copy.corpo,
      eventoChave: `lead_pool_equipe:${params.gerenteId}:${params.leadId ?? 'lote'}:${params.quantidade}`,
    });
    this.queueOutbound({
      tenantId: params.tenantId,
      userId: params.gerenteId,
      subject: copy.titulo,
      text: formatLeadWhatsApp({
        titulo: copy.whatsappTitulo,
        extra: copy.corpo,
        crmUrl: this.crmUrl(params.leadId),
      }),
      email: {
        titulo: copy.whatsappTitulo,
        extra: copy.corpo,
        crmUrl: this.crmUrl(params.leadId),
      },
    });
  }

  private async notifyPoolManagers(params: {
    tenantId: string;
    lead: LeadNotifySnapshot;
    actorUserId?: string | null;
  }) {
    const managers = await this.prisma.user.findMany({
      where: {
        tenantId: params.tenantId,
        status: UserStatus.ativo,
        role: { in: [Role.admin, Role.gerente] },
        ...(params.actorUserId ? { id: { not: params.actorUserId } } : {}),
      },
      select: { id: true },
    });
    const copy = leadPoolCopy(params.lead);
    for (const manager of managers) {
      await this.notificacoes.createLeadPool({
        userId: manager.id,
        leadId: params.lead.id,
        titulo: copy.titulo,
        corpo: copy.corpo,
        eventoChave: `lead_pool:${params.lead.id}`,
      });
      this.queueOutbound({
        tenantId: params.tenantId,
        userId: manager.id,
        subject: copy.titulo,
        text: formatLeadWhatsApp({
          titulo: copy.whatsappTitulo,
          lead: params.lead,
          crmUrl: this.crmUrl(params.lead.id),
        }),
        email: {
          titulo: copy.whatsappTitulo,
          lead: params.lead,
          crmUrl: this.crmUrl(params.lead.id),
        },
      });
    }
  }

  private queueOutbound(params: {
    tenantId: string;
    userId: string;
    subject: string;
    text: string;
    email: {
      titulo: string;
      lead?: LeadNotifySnapshot | null;
      extra?: string;
      crmUrl?: string | null;
    };
  }) {
    void this.sendOutbound(params).catch((error) => {
      this.logger.warn(
        `Aviso externo não enviado user=${params.userId}: ${
          error instanceof Error ? error.message : 'erro'
        }`,
      );
    });
  }

  /**
   * WhatsApp (OZap) e e-mail (SMTP) em paralelo.
   * Sem os dois canais, o aviso fica só no sino.
   */
  private async sendOutbound(params: {
    tenantId: string;
    userId: string;
    subject: string;
    text: string;
    email: {
      titulo: string;
      lead?: LeadNotifySnapshot | null;
      extra?: string;
      crmUrl?: string | null;
    };
  }) {
    await Promise.allSettled([
      this.tryWhatsApp(params),
      this.tryEmail(params),
    ]);
  }

  private async tryWhatsApp(params: {
    tenantId: string;
    userId: string;
    text: string;
  }): Promise<boolean> {
    if (!this.ozapApi.isConfigured()) return false;

    const [connection, user] = await Promise.all([
      this.prisma.tenantOzapConnection.findFirst({
        where: { tenantId: params.tenantId, ativo: true },
        select: { instanceId: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.user.findFirst({
        where: { id: params.userId, tenantId: params.tenantId },
        select: { whatsapp: true, phone: true },
      }),
    ]);

    if (!connection) return false;
    const to = user?.whatsapp?.trim() || user?.phone?.trim() || '';
    if (!to) return false;

    try {
      await this.ozapApi.sendText({
        instanceId: connection.instanceId,
        to,
        text: params.text,
      });
      return true;
    } catch (error) {
      this.logger.warn(
        `WhatsApp falhou user=${params.userId}, tentando e-mail: ${
          error instanceof Error ? error.message : 'erro'
        }`,
      );
      return false;
    }
  }

  private async tryEmail(params: {
    tenantId: string;
    userId: string;
    subject: string;
    text: string;
    email: {
      titulo: string;
      lead?: LeadNotifySnapshot | null;
      extra?: string;
      crmUrl?: string | null;
    };
  }) {
    if (!this.mailer.isConfigured()) {
      this.logger.warn(
        `SMTP ausente — e-mail de lead não enviado user=${params.userId}.`,
      );
      return;
    }

    const [user, tenant] = await Promise.all([
      this.prisma.user.findFirst({
        where: { id: params.userId, tenantId: params.tenantId },
        select: { email: true, notifyEmail: true },
      }),
      this.prisma.tenant.findUnique({
        where: { id: params.tenantId },
        select: { name: true, logoUrl: true },
      }),
    ]);
    const to = resolveNotifyEmail(user ?? {});
    if (!to) {
      this.logger.warn(
        `Usuário ${params.userId} sem e-mail válido (login/avisos) — e-mail não enviado.`,
      );
      return;
    }

    await this.mailer.sendText({
      to,
      subject: params.subject,
      text: params.text,
      html: formatLeadEmailHtml({
        ...params.email,
        brandName: tenant?.name,
        logoUrl: tenant?.logoUrl?.trim() || DEFAULT_BRAND_LOGO_URL,
      }),
    });
    this.logger.log(`E-mail de lead enviado user=${params.userId} to=${to}`);
  }

  private crmUrl(leadId?: string | null): string | null {
    const base = pickPublicFrontendUrl(
      this.config.get<string>('FRONTEND_URL'),
      this.config.get<string>('CRM_PUBLIC_URL'),
    );
    return `${base}${leadCrmPath(leadId)}`;
  }
}
