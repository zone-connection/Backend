import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { requireTenantId } from '../common/utils/tenant';
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
  ) {}

  async listChats(requester: AuthenticatedUser, page = 1, limit = 50) {
    const { instanceId } = await this.requireInstance(requester);
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

  private toCrmMediaUrl(url: string | null): string | null {
    if (!url) return null;
    if (
      this.ozapApi.isAllowedMediaHost(url) &&
      !this.ozapApi.needsMediaProxy(url)
    ) {
      return url;
    }
    return `/api/whatsapp/media?url=${encodeURIComponent(url)}`;
  }

  async sendMessage(
    chatId: string,
    content: string,
    requester: AuthenticatedUser,
  ) {
    const { instanceId } = await this.requireInstance(requester);
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
    const { instanceId } = await this.requireInstance(requester);
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
    const { instanceId } = await this.requireInstance(requester);
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
