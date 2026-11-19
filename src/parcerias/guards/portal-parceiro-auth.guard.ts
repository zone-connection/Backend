import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { PARCEIRO_COOKIE } from '../../common/utils/auth-cookies';
import { PrismaService } from '../../prisma/prisma.service';
import {
  PARCEIRO_JWT_KIND,
  type PortalParceiroSession,
} from '../parceiro.types';

@Injectable()
export class PortalParceiroAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = request.cookies?.[PARCEIRO_COOKIE.access];
    if (typeof token !== 'string' || token.length === 0) {
      throw new UnauthorizedException('Sessão inválida.');
    }

    let payload: { sub?: string; kind?: string; email?: string; name?: string };
    try {
      payload = await this.jwt.verifyAsync(token, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Token inválido.');
    }

    if (!payload?.sub || payload.kind !== PARCEIRO_JWT_KIND) {
      throw new UnauthorizedException('Token inválido.');
    }

    const parceiro = await this.prisma.corretorParceiro.findFirst({
      where: { id: payload.sub, ativo: true },
      select: { id: true, email: true, nome: true },
    });
    if (!parceiro) {
      throw new UnauthorizedException('Sessão inválida.');
    }

    const session: PortalParceiroSession = {
      parceiroId: parceiro.id,
      email: parceiro.email,
      name: parceiro.nome,
    };
    (request as Request & { parceiro: PortalParceiroSession }).parceiro =
      session;
    return true;
  }
}
