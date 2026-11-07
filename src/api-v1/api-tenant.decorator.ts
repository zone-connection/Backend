import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { ApiRequestContext } from './api-context';

export const ApiTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ApiRequestContext => {
    const req = ctx.switchToHttp().getRequest<{ api?: ApiRequestContext }>();
    if (!req.api) {
      throw new Error('Rota sem contexto de API.');
    }
    return req.api;
  },
);
