import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Role, UserStatus } from '@prisma/client';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Request } from 'express';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { COOKIE } from '../../common/utils/auth-cookies';
import type { UserPermissions } from '../../common/utils/user-permissions';
import { sanitizeUserPermissions } from '../../common/utils/user-permissions';
import { applyPlanoModules } from '../../tenants/tenant-plan';
import { PrismaService } from '../../prisma/prisma.service';

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
  name: string;
  tenantId: string | null;
  financeiroPerms?: {
    view: boolean;
    create: boolean;
    edit: boolean;
    delete: boolean;
  };
  permissions?: UserPermissions | null;
}

/** Lê o JWT do cookie httpOnly; cai no Authorization Bearer se existir. */
function extractAccessToken(req: Request): string | null {
  const fromCookie = req.cookies?.[COOKIE.access];
  if (typeof fromCookie === 'string' && fromCookie.length > 0) {
    return fromCookie;
  }
  return ExtractJwt.fromAuthHeaderAsBearerToken()(req);
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const secret = config.get<string>('JWT_ACCESS_SECRET');
    if (!secret) {
      throw new Error('JWT_ACCESS_SECRET não configurado no ambiente.');
    }

    super({
      jwtFromRequest: extractAccessToken,
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    if (!payload?.sub) {
      throw new UnauthorizedException('Token inválido.');
    }
    if ((payload as { kind?: string }).kind === 'portal_proprietario') {
      throw new UnauthorizedException('Sessão inválida.');
    }

    const row = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        role: true,
        name: true,
        tenantId: true,
        status: true,
        financeiroCanView: true,
        financeiroCanCreate: true,
        financeiroCanEdit: true,
        financeiroCanDelete: true,
        permissions: true,
        tenant: { select: { plano: true, modules: true } },
      },
    });

    if (!row || row.status !== UserStatus.ativo) {
      throw new UnauthorizedException('Sessão inválida.');
    }

    return {
      id: row.id,
      email: row.email,
      role: row.role,
      name: row.name,
      tenantId: row.tenantId,
      financeiroPerms: {
        view: row.financeiroCanView !== false,
        create: row.financeiroCanCreate !== false,
        edit: row.financeiroCanEdit !== false,
        delete: row.financeiroCanDelete !== false,
      },
      permissions: sanitizeUserPermissions(row.permissions),
      tenantModules: row.tenant
        ? applyPlanoModules(row.tenant.plano, row.tenant.modules)
        : null,
    };
  }
}
