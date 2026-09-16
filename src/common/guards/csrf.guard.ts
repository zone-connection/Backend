import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { timingSafeEqual } from 'crypto';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { COOKIE, CSRF_HEADER, PORTAL_COOKIE } from '../utils/auth-cookies';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function csrfTokensMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/**
 * CSRF double-submit: o cookie `crm_csrf` (legível por JS) deve bater com o
 * header `X-CSRF-Token`. Impede que um site terceiro force o browser a
 * mutar dados usando cookies httpOnly da sessão.
 *
 * Rotas @Public() e métodos seguros (GET/HEAD/OPTIONS) são liberados.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(request.method.toUpperCase())) return true;

    const path = `${request.originalUrl ?? ''} ${request.path ?? ''}`;
    const csrfCookieName = path.includes('portal-proprietario')
      ? PORTAL_COOKIE.csrf
      : COOKIE.csrf;
    const cookieToken = request.cookies?.[csrfCookieName] as string | undefined;
    const headerToken = request.get(CSRF_HEADER) ?? undefined;

    if (
      !cookieToken ||
      !headerToken ||
      !csrfTokensMatch(cookieToken, headerToken)
    ) {
      throw new ForbiddenException('Token CSRF inválido ou ausente.');
    }

    return true;
  }
}
