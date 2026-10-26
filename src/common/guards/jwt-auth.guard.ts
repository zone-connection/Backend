import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { Role, TwoFactorStatus } from '@prisma/client';
import type { Request } from 'express';
import { isObservable, lastValueFrom } from 'rxjs';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AuthenticatedUser } from '../types/authenticated-user';

const PENDING_ALLOWED = [
  '/auth/me',
  '/auth/logout',
  '/auth/refresh',
  '/seguranca/2fa/eu',
  '/seguranca/2fa/termos',
  '/seguranca/2fa/preparar',
  '/seguranca/2fa/confirmar',
  '/seguranca/2fa/aceitar-risco',
];

/**
 * Guard global de autenticação. Exige um access token JWT válido,
 * exceto em rotas marcadas com @Public().
 * Administrador com decisão de 2FA pendente só alcança o fluxo de escolha.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const result = super.canActivate(context);
    const allowed = isObservable(result)
      ? await lastValueFrom(result)
      : await result;
    if (!allowed) return false;

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as
      | (AuthenticatedUser & { twoFactorStatus?: TwoFactorStatus })
      | undefined;
    if (
      user?.role === Role.admin &&
      user.twoFactorStatus === TwoFactorStatus.pendente
    ) {
      const path = (request.originalUrl || request.url || '').split('?')[0];
      if (!PENDING_ALLOWED.some((item) => path.endsWith(item))) {
        throw new ForbiddenException(
          'Escolha manter ou desativar a autenticação de dois fatores antes de acessar o CRM.',
        );
      }
    }

    return true;
  }
}
