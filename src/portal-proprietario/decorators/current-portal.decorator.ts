import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { PortalProprietarioSession } from '../portal-proprietario.types';

export const CurrentPortal = createParamDecorator(
  (
    data: keyof PortalProprietarioSession | undefined,
    ctx: ExecutionContext,
  ) => {
    const request = ctx.switchToHttp().getRequest<Request>();
    const session = (request as Request & { portal?: PortalProprietarioSession })
      .portal;
    return data && session ? session[data] : session;
  },
);
