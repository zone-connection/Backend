import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { isGrupoZapAuthorized } from '../grupozap-auth';

/** Basic Auth da documentação: a SECRET_KEY identifica o Grupo OLX, não o anunciante. */
@Injectable()
export class GrupoZapWebhookGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const secret = this.config.get<string>('GRUPOZAP_SECRET_KEY')?.trim() ?? '';
    if (!secret) {
      throw new ServiceUnavailableException(
        'Integração Grupo OLX ainda não foi configurada.',
      );
    }

    const request = context.switchToHttp().getRequest<Request>();
    if (!isGrupoZapAuthorized(request.get('authorization'), secret)) {
      throw new UnauthorizedException('Webhook Grupo OLX não autorizado.');
    }
    return true;
  }
}
