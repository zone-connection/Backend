import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const SITEVERIFY_URL =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify';

type SiteverifyResponse = {
  success?: boolean;
  'error-codes'?: string[];
};

/**
 * Confere o token do Turnstile antes da senha.
 * Sem chave, o login local segue. Em produção a chave é obrigatória no boot.
 */
@Injectable()
export class TurnstileService {
  private readonly logger = new Logger(TurnstileService.name);

  constructor(private readonly config: ConfigService) {}

  async assertValid(token: string | undefined, ip?: string): Promise<void> {
    const secret = this.config.get<string>('TURNSTILE_SECRET_KEY')?.trim() ?? '';
    if (!secret) return;

    const response = token?.trim() ?? '';
    if (!response) {
      throw new BadRequestException(
        'Não foi possível confirmar o acesso. Tente novamente.',
      );
    }

    let body: SiteverifyResponse;
    try {
      const res = await fetch(SITEVERIFY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          secret,
          response,
          ...(ip ? { remoteip: ip } : {}),
        }),
        signal: AbortSignal.timeout(8_000),
      });
      body = (await res.json()) as SiteverifyResponse;
    } catch (error) {
      this.logger.warn(
        `Turnstile indisponível: ${error instanceof Error ? error.message : error}`,
      );
      throw new ServiceUnavailableException(
        'Não foi possível confirmar o acesso. Tente novamente.',
      );
    }

    if (body.success === true) return;

    this.logger.warn(
      `Turnstile recusou o token (${(body['error-codes'] ?? []).join(', ') || 'sem código'}).`,
    );
    throw new BadRequestException(
      'Não foi possível confirmar o acesso. Tente novamente.',
    );
  }
}
