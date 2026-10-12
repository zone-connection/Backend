import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { toWhatsAppChatId } from '../common/utils/phone';
import {
  OZAP_API_BASE_DEFAULT,
  OZAP_LIST_TIMEOUT_MS,
  OZAP_SEND_TIMEOUT_MS,
} from './ozap.constants';

export class OzapApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'OzapApiError';
  }
}

export type OzapChatKind = 'client' | 'ai' | 'agent' | 'follow_up';

export type OzapChatMessage = {
  id: string;
  direction: 'in' | 'out';
  kind: OzapChatKind;
  text: string;
  at: string | null;
  source: string | null;
  mediaType: string | null;
  mediaUrl: string | null;
};

export type OzapInboxChat = {
  chatId: string;
  name: string;
  phone: string | null;
  lastMessage: string | null;
  lastMessageAt: string | null;
  unread: number;
  isGroup: boolean;
  aiPaused: boolean;
  pausedUntil: string | null;
  leadStatus: string | null;
};

@Injectable()
export class OzapApiClient {
  private readonly logger = new Logger(OzapApiClient.name);
  private readonly resolvedChatIds = new Map<string, string>();

  constructor(private readonly config: ConfigService) {}

  apiKey(): string {
    return this.config.get<string>('OZAP_API_KEY')?.trim() ?? '';
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey());
  }

  /**
   * Envia texto via API de entrada do OZap.
   * Docs: POST /api/v1/{instanceId}/messages/send  header X-API-Key
   */
  async sendText(params: {
    instanceId: number;
    to: string;
    text: string;
  }): Promise<void> {
    const to = toWhatsAppChatId(params.to);
    if (!to) {
      throw new OzapApiError(0, 'Número de WhatsApp inválido.');
    }
    await this.sendChatText({
      instanceId: params.instanceId,
      chatId: to,
      text: params.text,
    });
  }

  async sendChatText(params: {
    instanceId: number;
    chatId: string;
    text: string;
  }): Promise<void> {
    const apiKey = this.requireApiKey();
    const to = this.phoneDigits(params.chatId);
    if (!to) {
      throw new OzapApiError(0, 'Chat do WhatsApp inválido.');
    }

    const base = this.baseUrl();
    const primary = `${base}/api/v1/${params.instanceId}/messages/send`;
    const legacyChat = this.messagesUrl(params.instanceId, to);
    const legacyMessages = `${base}/api/v1/${params.instanceId}/messages`;

    try {
      await this.postJson(primary, apiKey, { to, message: params.text });
    } catch (error) {
      if (
        !(error instanceof OzapApiError) ||
        (error.status !== 404 && error.status !== 405)
      ) {
        throw error;
      }
      try {
        await this.postJson(legacyChat, apiKey, { content: params.text });
      } catch (legacyError) {
        if (
          legacyError instanceof OzapApiError &&
          (legacyError.status === 404 || legacyError.status === 405)
        ) {
          await this.postJson(legacyMessages, apiKey, {
            to,
            content: params.text,
          });
          return;
        }
        throw legacyError;
      }
    }
  }

  async listMessages(params: {
    instanceId: number;
    chatId: string;
  }): Promise<OzapChatMessage[]> {
    const apiKey = this.requireApiKey();
    const chatId = params.chatId.trim();
    if (!chatId) {
      throw new OzapApiError(0, 'Chat do WhatsApp inválido.');
    }

    let lastError: OzapApiError | null = null;
    for (const id of this.orderedChatIds(params.instanceId, chatId)) {
      try {
        const payload = await this.getJson(
          `${this.messagesUrl(params.instanceId, id)}?limit=80`,
          apiKey,
        );
        this.rememberChatId(params.instanceId, chatId, id);
        return this.normalizeMessages(payload);
      } catch (error) {
        if (
          error instanceof OzapApiError &&
          (error.status === 404 || error.status === 405)
        ) {
          lastError = error;
          continue;
        }
        throw error;
      }
    }
    throw lastError ?? new OzapApiError(0, 'OZap recusou a leitura.');
  }

  async listChats(
    instanceId: number,
    page = 1,
    limit = 50,
  ): Promise<{
    chats: OzapInboxChat[];
    page: number;
    limit: number;
    total: number | null;
    hasMore: boolean;
  }> {
    const apiKey = this.requireApiKey();
    const safePage = Math.max(1, Math.floor(page) || 1);
    const safeLimit = Math.min(100, Math.max(10, Math.floor(limit) || 50));
    const payload = await this.getJson(
      `${this.baseUrl()}/api/v1/${instanceId}/chats?limit=${safeLimit}&page=${safePage}`,
      apiKey,
    );
    const rec = this.asRecord(payload);
    const data = this.asRecord(rec?.data) ?? rec;
    const rows = Array.isArray(data)
      ? data
      : Array.isArray(data?.chats)
        ? data.chats
        : this.extractList(payload);
    const chats: OzapInboxChat[] = [];
    for (const row of rows) {
      const chat = this.normalizeChat(row);
      if (chat) chats.push(chat);
    }
    const meta = this.asRecord(rec?.meta) ?? this.asRecord(data?.meta) ?? rec;
    const totalRaw = Number(
      rec?.total ??
        rec?.count ??
        data?.total ??
        meta?.total ??
        meta?.count,
    );
    const total = Number.isFinite(totalRaw) && totalRaw >= 0 ? totalRaw : null;
    const hasMoreFlag = rec?.has_more ?? rec?.hasMore ?? data?.has_more ?? data?.hasMore;
    const hasMore =
      typeof hasMoreFlag === 'boolean'
        ? hasMoreFlag
        : total !== null
          ? safePage * safeLimit < total
          : chats.length >= safeLimit;
    return { chats, page: safePage, limit: safeLimit, total, hasMore };
  }

  async pauseChat(params: {
    instanceId: number;
    chatId: string;
    pausedUntil: string | null;
  }): Promise<void> {
    const apiKey = this.requireApiKey();
    let lastError: OzapApiError | null = null;
    for (const id of this.orderedChatIds(params.instanceId, params.chatId)) {
      const url = `${this.baseUrl()}/api/v1/${params.instanceId}/chats/${encodeURIComponent(id)}`;
      try {
        await this.patchJson(url, apiKey, { paused_until: params.pausedUntil });
        this.rememberChatId(params.instanceId, params.chatId, id);
        return;
      } catch (error) {
        if (
          error instanceof OzapApiError &&
          (error.status === 404 || error.status === 405)
        ) {
          lastError = error;
          continue;
        }
        throw error;
      }
    }
    throw lastError ?? new OzapApiError(0, 'OZap recusou pausar a IA.');
  }

  private orderedChatIds(instanceId: number, chatId: string): string[] {
    const remembered = this.resolvedChatIds.get(this.chatCacheKey(instanceId, chatId));
    const variants = this.chatIdVariants(chatId);
    if (!remembered) return variants;
    return [remembered, ...variants.filter((id) => id !== remembered)];
  }

  private rememberChatId(instanceId: number, chatId: string, resolved: string) {
    this.resolvedChatIds.set(this.chatCacheKey(instanceId, chatId), resolved);
  }

  private chatCacheKey(instanceId: number, chatId: string): string {
    return `${instanceId}:${this.phoneDigits(chatId) || chatId.trim()}`;
  }

  private chatIdVariants(chatId: string): string[] {
    const raw = chatId.trim();
    const digits = this.phoneDigits(raw);
    const variants: string[] = [];
    if (raw) variants.push(raw);
    if (digits && digits !== raw) variants.push(digits);
    if (digits) {
      variants.push(`${digits}@s.whatsapp.net`);
      variants.push(`${digits}@c.us`);
    }
    return [...new Set(variants)];
  }

  private phoneDigits(chatId: string): string {
    return chatId
      .trim()
      .replace(/@s\.whatsapp\.net$/i, '')
      .replace(/@c\.us$/i, '')
      .replace(/\D/g, '');
  }

  private authHeaders(apiKey: string): Record<string, string> {
    return {
      'X-API-Key': apiKey,
      Accept: 'application/json',
    };
  }

  normalizeMessages(payload: unknown): OzapChatMessage[] {
    return this.extractList(payload)
      .map((raw, index) => this.normalizeMessage(raw, index))
      .filter((item): item is OzapChatMessage => item !== null);
  }

  private requireApiKey(): string {
    const apiKey = this.apiKey();
    if (!apiKey) {
      throw new OzapApiError(0, 'OZAP_API_KEY não configurada.');
    }
    return apiKey;
  }

  private messagesUrl(instanceId: number, chatId: string): string {
    return `${this.baseUrl()}/api/v1/${instanceId}/chats/${encodeURIComponent(chatId)}/messages`;
  }

  private baseUrl(): string {
    const raw =
      this.config.get<string>('OZAP_API_BASE')?.trim() || OZAP_API_BASE_DEFAULT;
    return raw.replace(/\/$/, '');
  }

  private async getJson(url: string, apiKey: string): Promise<unknown> {
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: this.authHeaders(apiKey),
        signal: AbortSignal.timeout(OZAP_LIST_TIMEOUT_MS),
      });
    } catch (error) {
      const timedOut =
        error instanceof Error &&
        (error.name === 'TimeoutError' || error.name === 'AbortError');
      this.logger.warn(
        `OZap list falhou (${timedOut ? 'timeout' : 'rede'}): ${url}`,
      );
      throw new OzapApiError(
        0,
        timedOut
          ? 'Timeout ao ler WhatsApp via OZap.'
          : 'Falha de rede no OZap.',
      );
    }

    const text = await response.text().catch(() => '');
    if (!response.ok) {
      this.logger.warn(`OZap list HTTP ${response.status}: ${text.slice(0, 200)}`);
      throw new OzapApiError(
        response.status,
        `OZap recusou a leitura (${response.status}).`,
      );
    }
    if (!text) return [];
    try {
      return JSON.parse(text) as unknown;
    } catch {
      this.logger.warn(`OZap list JSON inválido: ${text.slice(0, 200)}`);
      throw new OzapApiError(0, 'Resposta inválida do OZap.');
    }
  }

  private async postJson(
    url: string,
    apiKey: string,
    body: Record<string, string>,
  ): Promise<void> {
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          ...this.authHeaders(apiKey),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(OZAP_SEND_TIMEOUT_MS),
      });
    } catch (error) {
      const timedOut =
        error instanceof Error &&
        (error.name === 'TimeoutError' || error.name === 'AbortError');
      this.logger.warn(
        `OZap send falhou (${timedOut ? 'timeout' : 'rede'}): ${url}`,
      );
      throw new OzapApiError(
        0,
        timedOut ? 'Timeout ao enviar WhatsApp via OZap.' : 'Falha de rede no OZap.',
      );
    }

    if (!response.ok) {
      const snippet = (await response.text().catch(() => '')).slice(0, 200);
      this.logger.warn(`OZap send HTTP ${response.status}: ${snippet}`);
      throw new OzapApiError(
        response.status,
        `OZap recusou o envio (${response.status}).`,
      );
    }
  }

  private async patchJson(
    url: string,
    apiKey: string,
    body: Record<string, string | null>,
  ): Promise<void> {
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'PATCH',
        headers: {
          ...this.authHeaders(apiKey),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(OZAP_SEND_TIMEOUT_MS),
      });
    } catch (error) {
      const timedOut =
        error instanceof Error &&
        (error.name === 'TimeoutError' || error.name === 'AbortError');
      throw new OzapApiError(
        0,
        timedOut ? 'Timeout ao atualizar o chat no OZap.' : 'Falha de rede no OZap.',
      );
    }
    if (!response.ok) {
      const snippet = (await response.text().catch(() => '')).slice(0, 200);
      this.logger.warn(`OZap patch HTTP ${response.status}: ${snippet}`);
      throw new OzapApiError(
        response.status,
        `OZap recusou atualizar o chat (${response.status}).`,
      );
    }
  }

  private normalizeChat(raw: unknown): OzapInboxChat | null {
    const rec = this.asRecord(raw);
    if (!rec) return null;
    const chatId =
      this.asString(rec.chat_id) ?? this.asString(rec.chatId) ?? this.asString(rec.id);
    if (!chatId) return null;
    const last =
      this.asString(rec.last_message) ?? this.asString(rec.lastMessage);
    return {
      chatId,
      name: this.asString(rec.name) ?? this.asString(rec.contact_name) ?? chatId,
      phone:
        this.asString(rec.phone_number) ??
        this.asString(rec.phone) ??
        (this.phoneDigits(chatId) || null),
      lastMessage: last,
      lastMessageAt:
        this.asString(rec.last_message_timestamp) ??
        this.asString(rec.lastMessageAt) ??
        this.asTimestamp(rec),
      unread: Number(rec.unread_count ?? rec.unread ?? 0) || 0,
      isGroup: rec.is_group === true || rec.isGroup === true,
      aiPaused: Boolean(rec.response_paused_until ?? rec.paused_until),
      pausedUntil:
        this.asString(rec.response_paused_until) ??
        this.asString(rec.paused_until),
      leadStatus: this.asString(rec.lead_status) ?? this.asString(rec.leadStatus),
    };
  }

  private extractList(payload: unknown): unknown[] {
    if (Array.isArray(payload)) return payload;
    const rec = this.asRecord(payload);
    if (!rec) return [];
    for (const key of ['data', 'messages', 'items', 'results']) {
      const value = rec[key];
      if (Array.isArray(value)) return value;
      const nested = this.asRecord(value);
      if (!nested) continue;
      for (const inner of ['data', 'messages', 'items']) {
        if (Array.isArray(nested[inner])) return nested[inner] as unknown[];
      }
    }
    return [];
  }

  private normalizeMessage(
    raw: unknown,
    index: number,
  ): OzapChatMessage | null {
    const rec = this.asRecord(raw);
    if (!rec) return null;
    const nestedContent = this.asRecord(rec.content);
    const mediaType =
      this.asString(rec.media_type) ?? this.asString(rec.mediaType);
    const mediaUrl = this.asString(rec.media_url) ?? this.asString(rec.mediaUrl);
    const text =
      this.asString(rec.content) ??
      this.asString(rec.text) ??
      this.asString(rec.body) ??
      this.asString(rec.message) ??
      this.asString(nestedContent?.text) ??
      this.asString(nestedContent?.body) ??
      (mediaType && mediaType !== 'text' ? `[${mediaType}]` : null);
    if (!text && !mediaUrl) return null;

    const messageType = this.asString(rec.message_type);
    const source =
      messageType ??
      this.asString(rec.source) ??
      this.asString(rec.role) ??
      this.asString(rec.sender);
    const directionRaw =
      this.asString(rec.direction) ?? this.asString(rec.type);
    const fromMe =
      rec.from_me === true || rec.fromMe === true || rec.outgoing === true;

    let direction: 'in' | 'out' = 'in';
    if (
      fromMe ||
      source === 'ai' ||
      source === 'bot' ||
      source === 'agent' ||
      source === 'ai_message' ||
      source === 'user_message' ||
      source === 'follow_up' ||
      directionRaw === 'out' ||
      directionRaw === 'outgoing' ||
      directionRaw === 'sent'
    ) {
      direction = 'out';
    }
    if (
      source === 'lead_message' ||
      directionRaw === 'in' ||
      directionRaw === 'incoming' ||
      directionRaw === 'received'
    ) {
      direction = 'in';
    }

    let kind: OzapChatKind = direction === 'in' ? 'client' : 'agent';
    if (source === 'lead_message') kind = 'client';
    if (source === 'ai_message' || source === 'ai') kind = 'ai';
    if (source === 'follow_up') kind = 'follow_up';
    if (source === 'user_message' || source === 'manual') kind = 'agent';

    return {
      id:
        this.asString(rec.id) ??
        this.asString(rec.message_id) ??
        `msg-${index}`,
      direction,
      kind,
      text: text ?? '',
      at: this.asTimestamp(rec),
      source,
      mediaType,
      mediaUrl,
    };
  }

  private asTimestamp(rec: Record<string, unknown>): string | null {
    const raw =
      rec.timestamp ?? rec.created_at ?? rec.sent_at ?? rec.date ?? rec.time;
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      const ms = raw > 1e12 ? raw : raw * 1000;
      return new Date(ms).toISOString();
    }
    return this.asString(raw);
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return null;
  }

  private asString(value: unknown): string | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed || null;
  }
}
