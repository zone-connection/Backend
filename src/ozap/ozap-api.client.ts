import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { toWhatsAppChatId } from '../common/utils/phone';
import { OZAP_API_BASE_DEFAULT, OZAP_SEND_TIMEOUT_MS } from './ozap.constants';

export class OzapApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'OzapApiError';
  }
}

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
    const apiKey = this.apiKey();
    if (!apiKey) {
      throw new OzapApiError(0, 'OZAP_API_KEY não configurada.');
    }
    const chatId = toWhatsAppChatId(params.to);
    if (!chatId) {
      throw new OzapApiError(0, 'Número de WhatsApp inválido.');
    }

    const base = this.baseUrl();
    const primary = `${base}/api/v1/${params.instanceId}/chats/${encodeURIComponent(chatId)}/messages`;
    const fallback = `${base}/api/v1/${params.instanceId}/messages`;

    try {
      await this.postJson(primary, apiKey, { content: params.text });
    } catch (error) {
      if (error instanceof OzapApiError && (error.status === 404 || error.status === 405)) {
        await this.postJson(fallback, apiKey, {
          to: chatId,
          content: params.text,
        });
        return;
      }
      throw error;
    }
  }

  private baseUrl(): string {
    const raw =
      this.config.get<string>('OZAP_API_BASE')?.trim() || OZAP_API_BASE_DEFAULT;
    return raw.replace(/\/$/, '');
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
}
