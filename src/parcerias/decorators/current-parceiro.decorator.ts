import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { PortalParceiroSession } from '../parceiro.types';

export const CurrentParceiro = createParamDecorator(
  (
    data: keyof PortalParceiroSession | undefined,
    ctx: ExecutionContext,
  ) => {
    const request = ctx.switchToHttp().getRequest<Request>();
    const session = (request as Request & { parceiro?: PortalParceiroSession })
      .parceiro;
    if (!session) return undefined;
    return data ? session[data] : session;
  },
);
