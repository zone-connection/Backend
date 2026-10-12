import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
    private readonly config: ConfigService,
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
    const apiKey = this.config.get<string>('OPENAI_API_KEY')?.trim();
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'Transcrição indisponível: OPENAI_API_KEY não configurada.',
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
