import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

const SEND_TIMEOUT_MS = 8_000;

export function isDeliverableEmail(email: string | null | undefined): boolean {
  const n = (email ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(n)) return false;
  return !n.endsWith('.local');
}

/** Preferência de aviso; se vazia/inválida, usa o e-mail de login. */
export function resolveNotifyEmail(user: {
  email?: string | null;
  notifyEmail?: string | null;
}): string {
  if (isDeliverableEmail(user.notifyEmail)) {
    return user.notifyEmail!.trim().toLowerCase();
  }
  if (isDeliverableEmail(user.email)) {
    return user.email!.trim().toLowerCase();
  }
  return '';
}

/** undefined = não alterar; null/vazio = limpar; senão e-mail normalizado. */
export function parseOptionalNotifyEmail(
  value: string | null | undefined,
): string | null | undefined {
  if (value === undefined) return undefined;
  const trimmed = (value ?? '').trim();
  if (!trimmed) return null;
  return trimmed.toLowerCase();
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private transporter: Transporter | null = null;

  constructor(private readonly config: ConfigService) {
    this.transporter = this.createTransporter();
    if (this.isConfigured()) {
      this.logger.log('SMTP de avisos ativo.');
    } else {
      this.logger.warn(
        'SMTP de avisos ausente (SMTP_HOST/USER/PASS/FROM). E-mail de lead desligado.',
      );
    }
  }

  isConfigured(): boolean {
    return Boolean(this.transporter && this.fromAddress());
  }

  async sendText(params: {
    to: string;
    subject: string;
    text: string;
  }): Promise<void> {
    if (!this.transporter) {
      throw new Error('SMTP não configurado.');
    }
    const from = this.fromAddress();
    if (!from) {
      throw new Error('SMTP_FROM não configurado.');
    }
    if (!isDeliverableEmail(params.to)) {
      throw new Error('E-mail do destinatário inválido.');
    }

    try {
      await this.transporter.sendMail({
        from,
        to: params.to,
        subject: params.subject,
        text: params.text,
        html: this.toHtml(params.text),
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'erro';
      this.logger.warn(`Falha SMTP to=${params.to}: ${detail}`);
      throw error;
    }
  }

  private fromAddress(): string {
    return (
      this.config.get<string>('SMTP_FROM')?.trim() ||
      this.config.get<string>('MAIL_FROM')?.trim() ||
      ''
    );
  }

  private createTransporter(): Transporter | null {
    const host = this.config.get<string>('SMTP_HOST')?.trim();
    const user = this.config.get<string>('SMTP_USER')?.trim();
    const pass = this.config.get<string>('SMTP_PASS') ?? '';
    if (!host || !user || !pass) return null;

    const port = Number(this.config.get<string>('SMTP_PORT') ?? 587);
    const secure =
      this.config.get<string>('SMTP_SECURE') === 'true' || port === 465;

    return nodemailer.createTransport({
      host,
      port: Number.isFinite(port) && port > 0 ? port : 587,
      secure,
      auth: { user, pass },
      connectionTimeout: SEND_TIMEOUT_MS,
      greetingTimeout: SEND_TIMEOUT_MS,
      socketTimeout: SEND_TIMEOUT_MS,
    });
  }

  private toHtml(text: string) {
    const escaped = escapeHtml(text).replace(/\n/g, '<br />');
    return `<div style="font-family:sans-serif;font-size:15px;line-height:1.5;color:#111">${escaped}</div>`;
  }
}
