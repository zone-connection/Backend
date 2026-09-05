import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ProprietarioPortalStatus, UserStatus } from '@prisma/client';
import type { Request } from 'express';
import { PORTAL_COOKIE } from '../../common/utils/auth-cookies';
import { PrismaService } from '../../prisma/prisma.service';
import {
  PORTAL_JWT_KIND,
  type PortalJwtPayload,
  type PortalProprietarioSession,
} from '../portal-proprietario.types';

@Injectable()
export class PortalProprietarioAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = request.cookies?.[PORTAL_COOKIE.access];
    if (typeof token !== 'string' || token.length === 0) {
      throw new UnauthorizedException('Sessão inválida.');
    }

    let payload: PortalJwtPayload;
    try {
      payload = await this.jwt.verifyAsync<PortalJwtPayload>(token, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Token inválido.');
    }

    if (
      !payload?.sub ||
      payload.kind !== PORTAL_JWT_KIND ||
      !payload.proprietarioId ||
      !payload.tenantId
    ) {
      throw new UnauthorizedException('Token inválido.');
    }

    const acesso = await this.prisma.proprietarioPortalAcesso.findFirst({
      where: {
        id: payload.sub,
        tenantId: payload.tenantId,
        proprietarioId: payload.proprietarioId,
      },
      select: {
        id: true,
        tenantId: true,
        proprietarioId: true,
        status: true,
        proprietario: { select: { nome: true, email: true } },
        tenant: { select: { status: true } },
      },
    });

    if (
      !acesso ||
      acesso.status !== ProprietarioPortalStatus.ativo ||
      acesso.tenant.status !== UserStatus.ativo
    ) {
      throw new UnauthorizedException('Sessão inválida.');
    }

    const session: PortalProprietarioSession = {
      acessoId: acesso.id,
      proprietarioId: acesso.proprietarioId,
      tenantId: acesso.tenantId,
      email: acesso.proprietario.email,
      name: acesso.proprietario.nome,
    };
    (request as Request & { portal: PortalProprietarioSession }).portal =
      session;
    return true;
  }
}
