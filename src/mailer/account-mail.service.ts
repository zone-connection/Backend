import { Injectable, Logger } from '@nestjs/common';
import { DEFAULT_CRM_ORIGIN } from '../lead-notify/lead-notify.messages';
import { PASSWORD_RESET_TTL_MS } from '../config/security.constants';
import {
  isDeliverableEmail,
  MailerService,
  resolveNotifyEmail,
} from './mailer.service';

const ROLE_LABEL: Record<string, string> = {
  admin: 'administrador',
  gerente: 'gerente',
  corretor: 'corretor',
  analista: 'analista',
  financeiro: 'financeiro',
  super_admin: 'super admin',
};

@Injectable()
export class AccountMailService {
  private readonly logger = new Logger(AccountMailService.name);

  constructor(private readonly mailer: MailerService) {}

  loginUrl(): string {
    return `${this.origin()}/login`;
  }

  resetUrl(token: string): string {
    return `${this.origin()}/login?token=${encodeURIComponent(token)}`;
  }

  async sendNewUser(params: {
    name: string;
    email: string;
    notifyEmail?: string | null;
    role: string;
    password: string;
  }): Promise<void> {
    const to = resolveNotifyEmail(params);
    if (!to) return;
    const papel = ROLE_LABEL[params.role] ?? params.role;
    const link = this.loginUrl();
    await this.send({
      to,
      subject: 'Seu acesso à Zone Connection',
      text: [
        `Olá, ${params.name}.`,
        '',
        `Sua conta de ${papel} foi criada.`,
        `Acesse: ${link}`,
        `E-mail: ${params.email}`,
        `Senha: ${params.password}`,
        '',
        'Troque a senha no primeiro acesso.',
      ].join('\n'),
    });
  }

  async sendAdminPasswordReset(params: {
    name: string;
    email: string;
    notifyEmail?: string | null;
    password: string;
  }): Promise<void> {
    const to = resolveNotifyEmail(params);
    if (!to) return;
    const link = this.loginUrl();
    await this.send({
      to,
      subject: 'Sua senha foi redefinida',
      text: [
        `Olá, ${params.name}.`,
        '',
        'Um administrador redefiniu a senha da sua conta.',
        `Acesse: ${link}`,
        `E-mail: ${params.email}`,
        `Nova senha: ${params.password}`,
        '',
        'Se você não esperava esta alteração, avise o administrador da imobiliária.',
      ].join('\n'),
    });
  }

  async sendForgotPassword(params: {
    name: string;
    email: string;
    notifyEmail?: string | null;
    token: string;
  }): Promise<void> {
    const to = resolveNotifyEmail(params);
    if (!to) return;
    const minutes = Math.round(PASSWORD_RESET_TTL_MS / 60_000);
    const link = this.resetUrl(params.token);
    await this.send({
      to,
      subject: 'Redefinir senha — Zone Connection',
      text: [
        `Olá, ${params.name}.`,
        '',
        'Recebemos um pedido para redefinir a senha desta conta.',
        `Abra o link (válido por ${minutes} minutos):`,
        link,
        '',
        'Se você não pediu, ignore este e-mail. A senha atual continua valendo.',
      ].join('\n'),
    });
  }

  async sendPlanEnding(params: {
    to: string;
    tenantName: string;
    vencimento: Date;
  }): Promise<void> {
    if (!isDeliverableEmail(params.to)) return;
    const quando = formatDate(params.vencimento);
    await this.send({
      to: params.to,
      subject: `Plano de ${params.tenantName} vence em ${quando}`,
      text: [
        `O plano da imobiliária ${params.tenantName} vence em ${quando}.`,
        '',
        'Regularize a assinatura com a Zone Connection para o acesso não ser interrompido.',
        this.loginUrl(),
      ].join('\n'),
    });
  }

  async sendBillingFailed(params: {
    to: string;
    tenantName: string;
    descricao: string;
    valor: string;
    vencimento: string;
  }): Promise<void> {
    if (!isDeliverableEmail(params.to)) return;
    await this.send({
      to: params.to,
      subject: `Cobrança em atraso — ${params.tenantName}`,
      text: [
        `Há uma cobrança em atraso da imobiliária ${params.tenantName}.`,
        '',
        params.descricao,
        `Valor: ${params.valor}`,
        `Vencimento: ${params.vencimento}`,
        '',
        'Se o pagamento já foi feito, desconsidere este aviso.',
        this.loginUrl(),
      ].join('\n'),
    });
  }

  private origin(): string {
    return DEFAULT_CRM_ORIGIN;
  }

  private async send(params: { to: string; subject: string; text: string }) {
    if (!this.mailer.isConfigured()) {
      this.logger.warn(`SMTP ausente — e-mail não enviado: ${params.subject}`);
      return;
    }
    try {
      await this.mailer.sendText(params);
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'erro';
      this.logger.warn(`E-mail não enviado (${params.subject}): ${detail}`);
    }
  }
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(value);
}
