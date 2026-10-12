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

export type OzapChatMessage = {
  id: string;
  direction: 'in' | 'out';
  text: string;
  at: string | null;
  source: string | null;
};

@Injectable()
export class OzapApiClient {
  private readonly logger = new Logger(OzapApiClient.name);

  constructor(private readonly config: ConfigService) {}

  apiKey(): string {
    return this.config.get<string>('OZAP_API_KEY')?.trim() ?? '';
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey());
  }

  /**
   * Envia texto para um número via API de entrada do OZap.
   * Documentação no painel: GET/POST /api/v1/{instanceId}/chats/{chatId}/messages
   */
  async sendText(params: {
    instanceId: number;
    to: string;
    text: string;
  }): Promise<void> {
    const chatId = toWhatsAppChatId(params.to);
    if (!chatId) {
      throw new OzapApiError(0, 'Número de WhatsApp inválido.');
    }
    await this.sendChatText({
      instanceId: params.instanceId,
      chatId,
      text: params.text,
    });
  }

  async sendChatText(params: {
    instanceId: number;
    chatId: string;
    text: string;
  }): Promise<void> {
    const apiKey = this.requireApiKey();
    const chatId = params.chatId.trim();
    if (!chatId) {
      throw new OzapApiError(0, 'Chat do WhatsApp inválido.');
    }

    const base = this.baseUrl();
    const primary = this.messagesUrl(params.instanceId, chatId);
    const fallback = `${base}/api/v1/${params.instanceId}/messages`;

    try {
      await this.postJson(primary, apiKey, { content: params.text });
    } catch (error) {
      if (
        error instanceof OzapApiError &&
        (error.status === 404 || error.status === 405)
      ) {
        await this.postJson(fallback, apiKey, {
          to: chatId,
          content: params.text,
        });
        return;
      }
      throw error;
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
    for (const id of this.chatIdVariants(chatId)) {
      try {
        const payload = await this.getJson(
          this.messagesUrl(params.instanceId, id),
          apiKey,
        );
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

  private chatIdVariants(chatId: string): string[] {
    const raw = chatId.trim();
    const digits = raw.replace(/@c\.us$/i, '').replace(/\D/g, '');
    const variants = [raw];
    if (digits && digits !== raw) variants.push(digits);
    if (digits) variants.push(`${digits}@c.us`);
    return [...new Set(variants)];
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
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
        },
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
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
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
    const text =
      this.asString(rec.content) ??
      this.asString(rec.text) ??
      this.asString(rec.body) ??
      this.asString(rec.message) ??
      this.asString(nestedContent?.text) ??
      this.asString(nestedContent?.body);
    if (!text) return null;

    const source =
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
      directionRaw === 'out' ||
      directionRaw === 'outgoing' ||
      directionRaw === 'sent'
    ) {
      direction = 'out';
    }
    if (
      directionRaw === 'in' ||
      directionRaw === 'incoming' ||
      directionRaw === 'received'
    ) {
      direction = 'in';
    }

    return {
      id:
        this.asString(rec.id) ??
        this.asString(rec.message_id) ??
        `msg-${index}`,
      direction,
      text,
      at: this.asTimestamp(rec),
      source,
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
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed || null;
  }
}
