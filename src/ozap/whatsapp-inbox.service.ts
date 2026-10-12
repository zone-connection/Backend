import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { requireTenantId } from '../common/utils/tenant';
import {
  canSendWhatsappInbox,
  seesAllWhatsappInbox,
} from '../common/utils/roles';
import { TeamScopeService } from '../equipes/team-scope.service';
import {
  OzapApiClient,
  OzapApiError,
  type OzapChatMessage,
  type OzapInboxChat,
} from './ozap-api.client';

const IA_PAUSED_UNTIL = '2099-12-31T23:59:59.000Z';

@Injectable()
export class WhatsappInboxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ozapApi: OzapApiClient,
    private readonly config: ConfigService,
    private readonly teamScope: TeamScopeService,
  ) {}

  async listChats(requester: AuthenticatedUser, page = 1, limit = 50) {
    const { instanceId } = await this.requireInstance(requester);
    if (!seesAllWhatsappInbox(requester.role)) {
      return this.listScopedChats(requester, instanceId, page, limit);
    }
    try {
      const listed = await this.ozapApi.listChats(instanceId, page, limit);
      const chats = listed.chats;
      const chatIds = [
        ...new Set(
          chats.flatMap((chat) =>
            [chat.chatId, chat.phone].filter((id): id is string => Boolean(id)),
          ),
        ),
      ];
      const links =
        chatIds.length === 0
          ? []
          : await this.prisma.leadOzapLink.findMany({
              where: { instanceId, chatId: { in: chatIds } },
              select: {
                chatId: true,
                leadId: true,
                lead: { select: { id: true, nome: true } },
              },
            });
      const byChat = new Map(links.map((link) => [link.chatId, link] as const));
      return {
        available: true as const,
        instanceId,
        page: listed.page,
        limit: listed.limit,
        total: listed.total,
        hasMore: listed.hasMore,
        canSend: true,
        chats: chats.map((chat) => {
          const link =
            byChat.get(chat.chatId) ??
            (chat.phone ? byChat.get(chat.phone) : undefined);
          return {
            ...chat,
            leadId: link?.leadId ?? null,
            leadNome: link?.lead.nome ?? null,
          };
        }),
      };
    } catch (error) {
      this.throwOzap(error);
    }
  }

  async listMessages(chatId: string, requester: AuthenticatedUser) {
    const { instanceId } = await this.requireInstance(requester);
    await this.assertCanViewChat(requester, instanceId, chatId);
    try {
      const messages = await this.ozapApi.listMessages({ instanceId, chatId });
      return {
        available: true as const,
        chatId,
        messages: messages.map((message) => ({
          ...message,
          mediaUrl: this.toCrmMediaUrl(message.mediaUrl),
        })),
      };
    } catch (error) {
      this.throwOzap(error);
    }
  }

  async streamMedia(url: string, hint: string | undefined, requester: AuthenticatedUser) {
    await this.requireInstance(requester);
    try {
      return await this.ozapApi.fetchMedia(url, hint);
    } catch (error) {
      this.throwOzap(error);
    }
  }

  publicMediaUrl(raw: string | undefined): string | null {
    const url = raw?.trim() || null;
    if (!url) return null;
    if (
      this.ozapApi.isAllowedMediaHost(url) &&
      !this.ozapApi.needsMediaProxy(url)
    ) {
      return url;
    }
    return null;
  }

  async transcribeAudio(rawUrl: string, requester: AuthenticatedUser) {
    await this.requireInstance(requester);
    const url = rawUrl.trim();
    if (!url) {
      throw new BadRequestException('Informe o áudio.');
    }
    const apiKey =
      this.config.get<string>('OPENAI_API_KEY')?.trim() ||
      this.config.get<string>('OPENAI_KEY')?.trim();
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'Transcrição indisponível. Configure OPENAI_API_KEY no Backend (Render) e faça o deploy.',
      );
    }
    try {
      const file = await this.ozapApi.fetchMedia(url, 'audio');
      const form = new FormData();
      form.append(
        'file',
        new Blob([new Uint8Array(file.body)], {
          type: file.contentType || 'audio/ogg',
        }),
        'audio.ogg',
      );
      form.append('model', 'whisper-1');
      form.append('language', 'pt');
      const response = await fetch(
        'https://api.openai.com/v1/audio/transcriptions',
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}` },
          body: form,
        },
      );
      const payload = (await response.json().catch(() => null)) as
        | { text?: string; error?: { message?: string } }
        | null;
      if (!response.ok) {
        throw new ServiceUnavailableException(
          payload?.error?.message || 'A OpenAI recusou a transcrição.',
        );
      }
      return { text: payload?.text?.trim() || '' };
    } catch (error) {
      this.throwOzap(error);
    }
  }

  private toCrmMediaUrl(url: string | null): string | null {
    return this.ozapApi.clientMediaUrl(url);
  }

  async sendMessage(
    chatId: string,
    content: string,
    requester: AuthenticatedUser,
  ) {
    this.assertCanSend(requester);
    const { instanceId } = await this.requireInstance(requester);
    await this.assertCanViewChat(requester, instanceId, chatId);
    const text = content.trim();
    if (!text) {
      throw new BadRequestException('Informe a mensagem.');
    }
    try {
      await this.ozapApi.pauseChat({
        instanceId,
        chatId,
        pausedUntil: IA_PAUSED_UNTIL,
      });
      await this.ozapApi.sendChatText({ instanceId, chatId, text });
      return { ok: true as const, aiPaused: true as const };
    } catch (error) {
      this.throwOzap(error);
    }
  }

  async assumeChat(chatId: string, requester: AuthenticatedUser) {
    this.assertCanSend(requester);
    const { instanceId } = await this.requireInstance(requester);
    await this.assertCanViewChat(requester, instanceId, chatId);
    try {
      await this.ozapApi.pauseChat({
        instanceId,
        chatId,
        pausedUntil: IA_PAUSED_UNTIL,
      });
      return { ok: true as const, aiPaused: true as const };
    } catch (error) {
      this.throwOzap(error);
    }
  }

  async resumeChat(chatId: string, requester: AuthenticatedUser) {
    this.assertCanSend(requester);
    const { instanceId } = await this.requireInstance(requester);
    await this.assertCanViewChat(requester, instanceId, chatId);
    try {
      await this.ozapApi.pauseChat({
        instanceId,
        chatId,
        pausedUntil: null,
      });
      return { ok: true as const, aiPaused: false as const };
    } catch (error) {
      this.throwOzap(error);
    }
  }

  private assertCanSend(requester: AuthenticatedUser) {
    if (!canSendWhatsappInbox(requester.role)) {
      throw new ForbiddenException(
        'Seu perfil não pode enviar mensagens no WhatsApp.',
      );
    }
  }

  private async chatLeadWhere(
    requester: AuthenticatedUser,
  ): Promise<Prisma.LeadWhereInput> {
    const tenantId = requireTenantId(requester);
    if (requester.role === Role.gerente) {
      return this.teamScope.leadScope(requester);
    }
    return { tenantId, corretorId: requester.id };
  }

  private async listScopedChats(
    requester: AuthenticatedUser,
    instanceId: number,
    page: number,
    limit: number,
  ) {
    const safePage = Math.max(1, Math.floor(page) || 1);
    const safeLimit = Math.min(100, Math.max(10, Math.floor(limit) || 50));
    const leadWhere = await this.chatLeadWhere(requester);
    const where = { instanceId, lead: leadWhere };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.leadOzapLink.count({ where }),
      this.prisma.leadOzapLink.findMany({
        where,
        orderBy: { lastMessageAt: 'desc' },
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
        select: {
          chatId: true,
          lastMessageAt: true,
          lead: { select: { id: true, nome: true, telefone: true } },
        },
      }),
    ]);
    let ozapByChat = new Map<string, OzapInboxChat>();
    try {
      const listed = await this.ozapApi.listChats(instanceId, 1, 50);
      ozapByChat = new Map(
        listed.chats.map((chat) => [chat.chatId, chat] as const),
      );
    } catch {
      /* lista do CRM continua mesmo se o OZap falhar no preview */
    }
    return {
      available: true as const,
      instanceId,
      page: safePage,
      limit: safeLimit,
      total,
      hasMore: safePage * safeLimit < total,
      canSend: canSendWhatsappInbox(requester.role),
      chats: rows.map((row) => {
        const ozap =
          ozapByChat.get(row.chatId) ??
          (row.lead.telefone
            ? ozapByChat.get(row.lead.telefone.replace(/\D/g, ''))
            : undefined);
        return {
          chatId: row.chatId,
          name: row.lead.nome,
          phone: row.lead.telefone || ozap?.phone || null,
          lastMessage: ozap?.lastMessage ?? null,
          lastMessageAt:
            ozap?.lastMessageAt ?? row.lastMessageAt?.toISOString() ?? null,
          unread: ozap?.unread ?? 0,
          isGroup: ozap?.isGroup ?? false,
          aiPaused: ozap?.aiPaused ?? false,
          pausedUntil: ozap?.pausedUntil ?? null,
          leadStatus: ozap?.leadStatus ?? null,
          leadId: row.lead.id,
          leadNome: row.lead.nome,
        };
      }),
    };
  }

  private async assertCanViewChat(
    requester: AuthenticatedUser,
    instanceId: number,
    chatId: string,
  ) {
    if (seesAllWhatsappInbox(requester.role)) return;
    const leadWhere = await this.chatLeadWhere(requester);
    const digits = chatId.replace(/\D/g, '');
    const ids = [
      chatId.trim(),
      digits,
      digits ? `${digits}@s.whatsapp.net` : '',
      digits ? `${digits}@c.us` : '',
    ].filter(Boolean);
    const link = await this.prisma.leadOzapLink.findFirst({
      where: {
        instanceId,
        chatId: { in: ids },
        lead: leadWhere,
      },
      select: { id: true },
    });
    if (!link) {
      throw new ForbiddenException(
        'Você só pode ver conversas dos seus leads.',
      );
    }
  }

  private async requireInstance(requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);
    if (!this.ozapApi.isConfigured()) {
      throw new ServiceUnavailableException(
        'Integração WhatsApp (OZap) não configurada.',
      );
    }
    const connection = await this.prisma.tenantOzapConnection.findFirst({
      where: { tenantId, ativo: true },
      select: { instanceId: true },
    });
    if (!connection) {
      throw new NotFoundException(
        'A imobiliária ainda não tem instância WhatsApp conectada.',
      );
    }
    return connection;
  }

  private throwOzap(error: unknown): never {
    if (error instanceof OzapApiError) {
      if (error.status === 400) {
        throw new BadRequestException(error.message);
      }
      throw new ServiceUnavailableException(error.message);
    }
    throw error;
  }
}

export type { OzapChatMessage, OzapInboxChat };
