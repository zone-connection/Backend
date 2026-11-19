import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import type { Request } from 'express';

function secretsMatch(received: string, expected: string) {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** A Evolution envia a chave global no header apikey. Ela não sai do servidor. */
@Injectable()
export class EvolutionWebhookGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext) {
    const secret = this.config.get<string>('EVOLUTION_API_KEY')?.trim();
    if (!secret) {
      throw new ServiceUnavailableException('Evolution API ainda não foi configurada.');
    }
    const request = context.switchToHttp().getRequest<Request>();
    const received = request.get('apikey') ?? '';
    if (!received || !secretsMatch(received, secret)) {
      throw new UnauthorizedException('Webhook da Evolution não autorizado.');
    }
    return true;
  }
}
