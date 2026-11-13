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

function tokensMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

@Injectable()
export class IntegracaoGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get<string>('INTEGRACAO_API_TOKEN')?.trim() ?? '';
    if (expected.length < 16) {
      throw new ServiceUnavailableException(
        'Integração desligada: defina INTEGRACAO_API_TOKEN no servidor.',
      );
    }
    const req = context.switchToHttp().getRequest<Request>();
    const header = req.header('authorization') ?? '';
    const token = header.toLowerCase().startsWith('bearer ')
      ? header.slice(7).trim()
      : '';
    if (!token || !tokensMatch(token, expected)) {
      throw new UnauthorizedException('Token de integração inválido.');
    }
    return true;
  }
}
