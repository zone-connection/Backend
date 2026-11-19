import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export class EvolutionApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

@Injectable()
export class EvolutionApiClient {
  private readonly logger = new Logger(EvolutionApiClient.name);

  constructor(private readonly config: ConfigService) {}

  configured(): boolean {
    return Boolean(this.baseUrl() && this.apiKey());
  }

  async createInstance(instanceName: string, webhookUrl: string | null): Promise<unknown> {
    const webhook = webhookUrl
      ? {
          enabled: true,
          url: webhookUrl,
          byEvents: false,
          base64: false,
          events: ['CONNECTION_UPDATE', 'QRCODE_UPDATED'],
        }
      : undefined;
    return this.request('POST', '/instance/create', {
      instanceName,
      integration: 'WHATSAPP-BAILEYS',
      qrcode: true,
      ...(webhook ? { webhook } : {}),
    });
  }

  async connect(instanceName: string): Promise<unknown> {
    return this.request('GET', `/instance/connect/${encodeURIComponent(instanceName)}`);
  }

  async connectionState(instanceName: string): Promise<unknown> {
    return this.request(
      'GET',
      `/instance/connectionState/${encodeURIComponent(instanceName)}`,
    );
  }

  async logout(instanceName: string): Promise<void> {
    await this.request('DELETE', `/instance/logout/${encodeURIComponent(instanceName)}`);
  }

  async deleteInstance(instanceName: string): Promise<void> {
    await this.request('DELETE', `/instance/delete/${encodeURIComponent(instanceName)}`);
  }

  async sendText(instanceName: string, number: string, text: string): Promise<void> {
    await this.request('POST', `/message/sendText/${encodeURIComponent(instanceName)}`, {
      number,
      text,
      linkPreview: false,
    });
  }

  async ownerPhone(instanceName: string): Promise<string | null> {
    const payload = await this.request('GET', '/instance/fetchInstances');
    return phoneFromInstances(payload, instanceName);
  }

  private baseUrl(): string {
    return (this.config.get<string>('EVOLUTION_API_URL') ?? '').trim().replace(/\/+$/, '');
  }

  private apiKey(): string {
    return (this.config.get<string>('EVOLUTION_API_KEY') ?? '').trim();
  }

  private async request(
    method: string,
    path: string,
    body?: Record<string, unknown>,
  ): Promise<unknown> {
    const base = this.baseUrl();
    const key = this.apiKey();
    if (!base || !key) {
      throw new EvolutionApiError(0, 'Evolution API não configurada no servidor.');
    }
    let response: Response;
    try {
      response = await fetch(`${base}${path}`, {
        method,
        headers: {
          apikey: key,
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (error) {
      this.logger.warn(
        `Evolution indisponível ${method} ${path}: ${
          error instanceof Error ? error.message : 'erro de rede'
        }`,
      );
      throw new EvolutionApiError(0, 'Não foi possível falar com a Evolution API.');
    }
    if (response.status === 404 && method === 'GET') {
      return null;
    }
    const text = await response.text();
    const parsed: unknown = text ? safeJson(text) : null;
    if (!response.ok) {
      throw new EvolutionApiError(response.status, 'A Evolution API recusou a operação.');
    }
    return parsed;
  }
}

function phoneFromInstances(payload: unknown, instanceName: string): string | null {
  const rows = instanceRows(payload);
  for (const instance of rows) {
    const name = stringField(instance, ['instanceName', 'name']);
    if (name !== instanceName) continue;
    const owner = stringField(instance, ['ownerJid', 'owner', 'wuid', 'number']);
    if (!owner) return null;
    const digits = owner.split('@')[0]?.replace(/\D/g, '') ?? '';
    return digits.length >= 10 ? digits : null;
  }
  return null;
}

function instanceRows(payload: unknown): Record<string, unknown>[] {
  const list = Array.isArray(payload)
    ? payload
    : payload && typeof payload === 'object' && Array.isArray((payload as { instances?: unknown }).instances)
      ? (payload as { instances: unknown[] }).instances
      : [];
  return list.flatMap((row) => {
    if (!row || typeof row !== 'object') return [];
    const record = row as Record<string, unknown>;
    const nested = record.instance;
    if (nested && typeof nested === 'object') return [nested as Record<string, unknown>];
    return [record];
  });
}

function stringField(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return '';
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}
