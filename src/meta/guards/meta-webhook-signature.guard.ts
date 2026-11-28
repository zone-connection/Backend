import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { verifyMetaSignature256 } from '../meta-signature';

type RawBodyRequest = Request & { rawBody?: Buffer };

/**
 * Valida a assinatura HMAC-SHA256 do webhook Meta (`X-Hub-Signature-256`).
 * Exige `rawBody` habilitado no bootstrap do Nest.
 */
@Injectable()
export class MetaWebhookSignatureGuard implements CanActivate {
  private readonly logger = new Logger(MetaWebhookSignatureGuard.name);

  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext) {
    const appSecret = this.config.get<string>('META_APP_SECRET');
    if (!appSecret) {
      throw new ServiceUnavailableException(
        'Integração Meta ainda não foi configurada.',
      );
    }

    const request = context.switchToHttp().getRequest<RawBodyRequest>();
    const result = verifyMetaSignature256(
      request.rawBody,
      request.get('X-Hub-Signature-256'),
      appSecret,
    );

    if (result === 'ok') {
      return true;
    }

    this.logger.warn(`Assinatura HMAC rejeitada (${result}).`);

    if (result === 'missing_body') {
      throw new UnauthorizedException(
        'Corpo bruto da requisição Meta indisponível para validação.',
      );
    }
    if (result === 'missing_header') {
      throw new UnauthorizedException('Assinatura Meta ausente.');
    }
    throw new UnauthorizedException('Assinatura Meta inválida.');
  }
}
