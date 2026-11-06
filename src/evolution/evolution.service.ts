import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Prisma,
  WhatsappConnectionStatus,
  WhatsappNotificationStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { EvolutionApiClient, EvolutionApiError } from './evolution-api.client';
import {
  MAX_WHATSAPP_ATTEMPTS,
  NOVO_LEAD_NOTIFICATION,
  instanceNameForUser,
  leadWhatsappMessage,
  mapEvolutionState,
  parseEvolutionWebhook,
  phoneFromJid,
  readConnectionState,
  readQrBase64,
} from './evolution.messages';

const RETRY_MS = [20_000, 60_000, 180_000];

type PublicConnection = {
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  phoneNumber: string | null;
  notificationsEnabled: boolean;
  connectedAt: string | null;
  lastConnectionCheck: string | null;
  qrCode: string | null;
};

@Injectable()
export class EvolutionService implements OnModuleInit {
  private readonly logger = new Logger(EvolutionService.name);
  private readonly qrByUser = new Map<string, string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly api: EvolutionApiClient,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    void this.resumePending().catch((error: unknown) => {
      this.logger.warn(
        `Avisos pendentes não retomados: ${error instanceof Error ? error.message : 'erro'}`,
      );
    });
  }

  async mine(user: AuthenticatedUser): Promise<PublicConnection> {
    this.assertTenantUser(user);
    const row = await this.prisma.whatsappConnection.findUnique({
      where: { userId: user.id },
    });
    if (!row || row.tenantId !== user.tenantId) {
      return this.empty();
    }
    return this.toPublic(row, this.qrByUser.get(user.id) ?? null);
  }

  async connect(user: AuthenticatedUser): Promise<PublicConnection> {
    this.assertTenantUser(user);
    this.assertConfigured();
    const instanceName = instanceNameForUser(user.id);
    const existing = await this.prisma.whatsappConnection.findUnique({
      where: { userId: user.id },
    });
    if (existing && existing.tenantId !== user.tenantId) {
      throw new BadRequestException('Esta conta não pode usar essa conexão.');
    }
    const row = existing
      ? await this.prisma.whatsappConnection.update({
          where: { id: existing.id },
          data: {
            connectionStatus: WhatsappConnectionStatus.connecting,
            lastConnectionCheck: new Date(),
          },
        })
      : await this.prisma.whatsappConnection.create({
          data: {
            tenantId: user.tenantId as string,
            userId: user.id,
            instanceName,
            connectionStatus: WhatsappConnectionStatus.connecting,
            lastConnectionCheck: new Date(),
          },
        });
    try {
      await this.api.createInstance(row.instanceName, this.webhookUrl());
    } catch (error) {
      if (!this.alreadyExists(error)) throw this.asHttp(error);
    }
    const qrPayload = await this.api.connect(row.instanceName);
    const qr = readQrBase64(qrPayload);
    if (qr) this.qrByUser.set(user.id, qr);
    return this.toPublic(row, qr);
  }

  async disconnect(user: AuthenticatedUser): Promise<PublicConnection> {
    this.assertTenantUser(user);
    const row = await this.own(user);
    if (!row) return this.empty();
    this.qrByUser.delete(user.id);
    try {
      await this.api.logout(row.instanceName);
    } catch (error) {
      this.logger.warn(
        `Logout Evolution user=${user.id}: ${error instanceof Error ? error.message : 'erro'}`,
      );
    }
    const updated = await this.prisma.whatsappConnection.update({
      where: { id: row.id },
      data: {
        connectionStatus: WhatsappConnectionStatus.disconnected,
        disconnectedAt: new Date(),
        lastConnectionCheck: new Date(),
      },
    });
    return this.toPublic(updated, null);
  }

  async setNotifications(user: AuthenticatedUser, enabled: boolean): Promise<PublicConnection> {
    this.assertTenantUser(user);
    const row = await this.own(user);
    if (!row) {
      const created = await this.prisma.whatsappConnection.create({
        data: {
          tenantId: user.tenantId as string,
          userId: user.id,
          instanceName: instanceNameForUser(user.id),
          notificationsEnabled: enabled,
        },
      });
      return this.toPublic(created, null);
    }
    const updated = await this.prisma.whatsappConnection.update({
      where: { id: row.id },
      data: { notificationsEnabled: enabled },
    });
    return this.toPublic(updated, this.qrByUser.get(user.id) ?? null);
  }

  async refresh(user: AuthenticatedUser): Promise<PublicConnection> {
    this.assertTenantUser(user);
    const row = await this.own(user);
    if (!row) return this.empty();
    if (!this.api.configured()) return this.toPublic(row, this.qrByUser.get(user.id) ?? null);
    try {
      const payload = await this.api.connectionState(row.instanceName);
      const state = readConnectionState(payload);
      const status = state
        ? this.persistStatus(mapEvolutionState(state))
        : row.connectionStatus;
      const phone = phoneFromJid(
        payload && typeof payload === 'object'
          ? (payload as Record<string, unknown>).wuid
          : null,
      );
      const updated = await this.prisma.whatsappConnection.update({
        where: { id: row.id },
        data: {
          connectionStatus: status,
          lastConnectionCheck: new Date(),
          ...(phone ? { phoneNumber: phone } : {}),
          ...(status === WhatsappConnectionStatus.connected && !row.connectedAt
            ? { connectedAt: new Date() }
            : {}),
        },
      });
      if (status === WhatsappConnectionStatus.connected) this.qrByUser.delete(user.id);
      return this.toPublic(updated, this.qrByUser.get(user.id) ?? null);
    } catch (error) {
      this.logger.warn(
        `Estado Evolution user=${user.id}: ${error instanceof Error ? error.message : 'erro'}`,
      );
      return this.toPublic(row, this.qrByUser.get(user.id) ?? null);
    }
  }

  async team(user: AuthenticatedUser) {
    this.assertTenantUser(user);
    const rows = await this.prisma.whatsappConnection.findMany({
      where: { tenantId: user.tenantId as string },
      select: {
        userId: true,
        phoneNumber: true,
        connectionStatus: true,
        notificationsEnabled: true,
        connectedAt: true,
        user: { select: { name: true, role: true } },
      },
      orderBy: { user: { name: 'asc' } },
    });
    return rows.map((row) => ({
      userId: row.userId,
      name: row.user.name,
      role: row.user.role,
      status: row.connectionStatus,
      phoneNumber: row.phoneNumber,
      notificationsEnabled: row.notificationsEnabled,
      connectedAt: row.connectedAt?.toISOString() ?? null,
    }));
  }

  async applyWebhook(body: unknown): Promise<void> {
    const update = parseEvolutionWebhook(body);
    if (!update) return;
    const row = await this.prisma.whatsappConnection.findUnique({
      where: { instanceName: update.instanceName },
    });
    if (!row) return;
    await this.prisma.whatsappConnection.update({
      where: { id: row.id },
      data: {
        ...(update.status ? { connectionStatus: this.persistStatus(update.status) } : {}),
        ...(update.phoneNumber ? { phoneNumber: update.phoneNumber } : {}),
        lastConnectionCheck: new Date(),
        ...(update.status === 'connected' ? { connectedAt: row.connectedAt ?? new Date() } : {}),
        ...(update.status === 'disconnected' ? { disconnectedAt: new Date() } : {}),
      },
    });
    if (update.status === 'connected') this.qrByUser.delete(row.userId);
  }

  async enqueueNewLead(params: { tenantId: string; userId: string; leadId: string }): Promise<void> {
    try {
      const created = await this.prisma.whatsappNotification.create({
        data: {
          tenantId: params.tenantId,
          userId: params.userId,
          leadId: params.leadId,
          notificationType: NOVO_LEAD_NOTIFICATION,
          status: WhatsappNotificationStatus.pending,
        },
        select: { id: true },
      });
      void this.deliver(created.id);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return;
      }
      this.logger.warn(
        `Fila WhatsApp não gravada lead=${params.leadId}: ${
          error instanceof Error ? error.message : 'erro'
        }`,
      );
    }
  }

  private async deliver(id: string): Promise<void> {
    const row = await this.prisma.whatsappNotification.findUnique({
      where: { id },
      include: {
        user: { select: { name: true } },
        lead: { select: { nome: true, interesse: true, origem: true, tenantId: true } },
      },
    });
    if (!row || row.status === WhatsappNotificationStatus.sent) return;
    if (row.lead.tenantId !== row.tenantId) {
      await this.finish(row.id, WhatsappNotificationStatus.skipped, 'Lead de outra imobiliária.');
      return;
    }
    const connection = await this.prisma.whatsappConnection.findUnique({
      where: { userId: row.userId },
    });
    if (!connection || connection.tenantId !== row.tenantId) {
      await this.finish(row.id, WhatsappNotificationStatus.skipped, 'WhatsApp não conectado.');
      return;
    }
    if (!connection.notificationsEnabled) {
      await this.finish(row.id, WhatsappNotificationStatus.skipped, 'Avisos desativados.');
      return;
    }
    if (connection.connectionStatus !== WhatsappConnectionStatus.connected) {
      await this.retryOrStop(row.id, row.attempts, 'WhatsApp não conectado.');
      return;
    }
    const phone = await this.ensurePhone(connection);
    if (!phone) {
      await this.retryOrStop(row.id, row.attempts, 'Número do WhatsApp conectado não identificado.');
      return;
    }
    const attempt = row.attempts + 1;
    try {
      await this.api.sendText(
        connection.instanceName,
        phone,
        leadWhatsappMessage({
          nomeCorretor: row.user.name,
          nomeLead: row.lead.nome,
          interesse: row.lead.interesse,
          origem: row.lead.origem,
        }),
      );
      await this.prisma.whatsappNotification.update({
        where: { id: row.id },
        data: {
          status: WhatsappNotificationStatus.sent,
          attempts: attempt,
          sentAt: new Date(),
          errorMessage: null,
        },
      });
    } catch (error) {
      await this.retryOrStop(row.id, row.attempts, error instanceof Error ? error.message : 'Falha no envio.');
    }
  }

  private async resumePending() {
    const rows = await this.prisma.whatsappNotification.findMany({
      where: {
        status: WhatsappNotificationStatus.pending,
        attempts: { lt: MAX_WHATSAPP_ATTEMPTS },
      },
      select: { id: true },
      take: 100,
    });
    for (const row of rows) void this.deliver(row.id);
  }

  private async ensurePhone(connection: {
    id: string;
    instanceName: string;
    phoneNumber: string | null;
  }): Promise<string | null> {
    if (connection.phoneNumber) return connection.phoneNumber;
    try {
      const phone = await this.api.ownerPhone(connection.instanceName);
      if (!phone) return null;
      await this.prisma.whatsappConnection.update({
        where: { id: connection.id },
        data: { phoneNumber: phone },
      });
      return phone;
    } catch (error) {
      this.logger.warn(
        `Número da instância ${connection.instanceName} não lido: ${
          error instanceof Error ? error.message : 'erro'
        }`,
      );
      return null;
    }
  }

  private async retryOrStop(id: string, attempts: number, message: string) {
    const next = attempts + 1;
    if (next >= MAX_WHATSAPP_ATTEMPTS) {
      await this.finish(id, WhatsappNotificationStatus.failed, message, next);
      return;
    }
    await this.prisma.whatsappNotification.update({
      where: { id },
      data: {
        status: WhatsappNotificationStatus.pending,
        attempts: next,
        errorMessage: message,
      },
    });
    const wait = RETRY_MS[next - 1] ?? RETRY_MS[RETRY_MS.length - 1];
    setTimeout(() => void this.deliver(id), wait);
  }

  private async finish(
    id: string,
    status: WhatsappNotificationStatus,
    errorMessage: string,
    attempts?: number,
  ) {
    await this.prisma.whatsappNotification.update({
      where: { id },
      data: {
        status,
        errorMessage,
        ...(attempts !== undefined ? { attempts } : {}),
      },
    });
  }

  private async own(user: AuthenticatedUser) {
    const row = await this.prisma.whatsappConnection.findUnique({ where: { userId: user.id } });
    if (!row || row.tenantId !== user.tenantId) return null;
    return row;
  }

  private assertTenantUser(user: AuthenticatedUser) {
    if (!user.tenantId) {
      throw new BadRequestException('Esta conta não pertence a uma imobiliária.');
    }
  }

  private assertConfigured() {
    if (!this.api.configured()) {
      throw new ServiceUnavailableException(
        'A conexão de WhatsApp ainda não está disponível neste servidor.',
      );
    }
  }

  private webhookUrl(): string | null {
    const raw = this.config.get<string>('EVOLUTION_WEBHOOK_URL')?.trim();
    return raw || null;
  }

  private alreadyExists(error: unknown): boolean {
    return error instanceof EvolutionApiError && (error.status === 403 || error.status === 409);
  }

  private asHttp(error: unknown): ServiceUnavailableException {
    const message = error instanceof Error ? error.message : 'Falha na Evolution API.';
    return new ServiceUnavailableException(message);
  }

  private persistStatus(
    status: 'disconnected' | 'connecting' | 'connected' | 'error',
  ): WhatsappConnectionStatus {
    if (status === 'connected') return WhatsappConnectionStatus.connected;
    if (status === 'connecting') return WhatsappConnectionStatus.connecting;
    if (status === 'error') return WhatsappConnectionStatus.error;
    return WhatsappConnectionStatus.disconnected;
  }

  private empty(): PublicConnection {
    return {
      status: 'disconnected',
      phoneNumber: null,
      notificationsEnabled: true,
      connectedAt: null,
      lastConnectionCheck: null,
      qrCode: null,
    };
  }

  private toPublic(
    row: {
      connectionStatus: WhatsappConnectionStatus;
      phoneNumber: string | null;
      notificationsEnabled: boolean;
      connectedAt: Date | null;
      lastConnectionCheck: Date | null;
    },
    qrCode: string | null,
  ): PublicConnection {
    return {
      status: row.connectionStatus,
      phoneNumber: row.phoneNumber,
      notificationsEnabled: row.notificationsEnabled,
      connectedAt: row.connectedAt?.toISOString() ?? null,
      lastConnectionCheck: row.lastConnectionCheck?.toISOString() ?? null,
      qrCode: row.connectionStatus === WhatsappConnectionStatus.connected ? null : qrCode,
    };
  }
}
