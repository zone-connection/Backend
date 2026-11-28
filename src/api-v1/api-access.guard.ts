import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { API_SCOPES_KEY, type ApiRequestContext } from './api-context';
import { ApiOauthService } from './api-oauth.service';
import type { ApiScope } from './api-scopes';

type ApiRequest = Request & { api?: ApiRequestContext };

@Injectable()
export class ApiAccessGuard implements CanActivate {
  constructor(
    private readonly oauth: ApiOauthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<ApiRequest>();
    const header = req.header('authorization') ?? '';
    const token = header.toLowerCase().startsWith('bearer ')
      ? header.slice(7).trim()
      : '';
    if (!token) throw new UnauthorizedException('token ausente');

    const claims = await this.oauth.authenticate(token);
    const required =
      this.reflector.getAllAndOverride<ApiScope[]>(API_SCOPES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    const missing = required.filter((scope) => !claims.scopes.includes(scope));
    if (missing.length > 0) {
      throw new ForbiddenException('scope não autorizado');
    }

    req.api = {
      appId: claims.appId,
      clientId: claims.sub,
      tenantId: claims.tenantId,
      scopes: claims.scopes,
      jti: claims.jti,
    };
    return true;
  }
}
