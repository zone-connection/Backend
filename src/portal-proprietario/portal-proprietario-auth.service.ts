import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ProprietarioPortalStatus,
  UserStatus,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import {
  PASSWORD_RESET_TTL_MS,
  SALT_ROUNDS,
} from '../config/security.constants';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateProprietarioPortalDto } from './dto/portal-auth.dto';
import {
  PORTAL_JWT_KIND,
  type PortalJwtPayload,
  type PortalProprietarioSession,
} from './portal-proprietario.types';

const GENERIC_CREDENTIALS_ERROR = 'Credenciais inválidas.';
const DUMMY_HASH = bcrypt.hashSync('timing-attack-placeholder', SALT_ROUNDS);

export type PortalAuthTokens = {
  accessToken: string;
  refreshToken: string;
};

export type PortalAuthResult = PortalAuthTokens & {
  proprietario: {
    id: string;
    nome: string;
    email: string;
    tenantId: string;
  };
};

@Injectable()
export class PortalProprietarioAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(
    email: string,
    password: string,
    tenantSlug?: string,
  ): Promise<PortalAuthResult> {
    const normalizedEmail = email.toLowerCase().trim();
    const candidatos = await this.prisma.proprietario.findMany({
      where: {
        email: { equals: normalizedEmail, mode: 'insensitive' },
        ...(tenantSlug
          ? { tenant: { slug: tenantSlug } }
          : {}),
        portalAcesso: { isNot: null },
      },
      include: {
        portalAcesso: true,
        tenant: { select: { id: true, status: true, slug: true } },
      },
      take: 3,
    });

    const row =
      candidatos.length === 1
        ? candidatos[0]
        : candidatos.length > 1 && tenantSlug
          ? candidatos[0]
          : null;

    if (candidatos.length > 1 && !tenantSlug) {
      await bcrypt.compare(password, DUMMY_HASH);
      throw new BadRequestException(
        'Informe o identificador da imobiliária (tenantSlug) para entrar.',
      );
    }

    const acesso = row?.portalAcesso ?? null;
    const passwordMatches = await bcrypt.compare(
      password,
      acesso?.password ?? DUMMY_HASH,
    );

    if (!row || !acesso || !passwordMatches) {
      throw new UnauthorizedException(GENERIC_CREDENTIALS_ERROR);
    }

    if (row.tenant.status !== UserStatus.ativo) {
      throw new ForbiddenException('Acesso ao portal desativado.');
    }
    if (acesso.status !== ProprietarioPortalStatus.ativo) {
      throw new ForbiddenException('Acesso ao portal desativado.');
    }

    const tokens = await this.issueTokens({
      acessoId: acesso.id,
      proprietarioId: row.id,
      tenantId: row.tenantId,
      email: row.email,
      name: row.nome,
    });

    const hashedRefresh = createHash('sha256')
      .update(tokens.refreshToken)
      .digest('hex');
    await this.prisma.proprietarioPortalAcesso.update({
      where: { id: acesso.id },
      data: { hashedRefreshToken: hashedRefresh, lastLoginAt: new Date() },
    });

    return {
      ...tokens,
      proprietario: {
        id: row.id,
        nome: row.nome,
        email: row.email,
        tenantId: row.tenantId,
      },
    };
  }

  async refresh(refreshToken: string | undefined): Promise<PortalAuthTokens> {
    if (!refreshToken) {
      throw new UnauthorizedException('Sessão inválida.');
    }

    let payload: PortalJwtPayload;
    try {
      payload = await this.jwt.verifyAsync<PortalJwtPayload>(refreshToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Token inválido.');
    }

    if (payload.kind !== PORTAL_JWT_KIND || !payload.sub) {
      throw new UnauthorizedException('Token inválido.');
    }

    const acesso = await this.prisma.proprietarioPortalAcesso.findFirst({
      where: { id: payload.sub, tenantId: payload.tenantId },
      include: { proprietario: { select: { nome: true, email: true } } },
    });
    const hashed = createHash('sha256').update(refreshToken).digest('hex');
    if (
      !acesso ||
      acesso.status !== ProprietarioPortalStatus.ativo ||
      !this.tokensMatch(acesso.hashedRefreshToken, hashed)
    ) {
      throw new UnauthorizedException('Sessão inválida.');
    }

    const tokens = await this.issueTokens({
      acessoId: acesso.id,
      proprietarioId: acesso.proprietarioId,
      tenantId: acesso.tenantId,
      email: acesso.proprietario.email,
      name: acesso.proprietario.nome,
    });
    await this.prisma.proprietarioPortalAcesso.update({
      where: { id: acesso.id },
      data: {
        hashedRefreshToken: createHash('sha256')
          .update(tokens.refreshToken)
          .digest('hex'),
      },
    });
    return tokens;
  }

  async logout(acessoId: string | undefined): Promise<void> {
    if (!acessoId) return;
    await this.prisma.proprietarioPortalAcesso.updateMany({
      where: { id: acessoId },
      data: { hashedRefreshToken: null },
    });
  }

  me(session: PortalProprietarioSession) {
    return {
      id: session.proprietarioId,
      nome: session.name,
      email: session.email,
      tenantId: session.tenantId,
    };
  }

  async changePassword(
    session: PortalProprietarioSession,
    senhaAtual: string,
    senhaNova: string,
  ) {
    const acesso = await this.prisma.proprietarioPortalAcesso.findFirst({
      where: { id: session.acessoId, tenantId: session.tenantId },
    });
    if (!acesso) throw new UnauthorizedException(GENERIC_CREDENTIALS_ERROR);
    const ok = await bcrypt.compare(senhaAtual, acesso.password);
    if (!ok) {
      throw new UnauthorizedException('Senha atual incorreta.');
    }
    const password = await bcrypt.hash(senhaNova, SALT_ROUNDS);
    await this.prisma.proprietarioPortalAcesso.update({
      where: { id: acesso.id },
      data: { password, hashedRefreshToken: null },
    });
  }

  async forgotPassword(
    email: string,
    tenantSlug?: string,
  ): Promise<{ resetToken?: string }> {
    const normalized = email.toLowerCase().trim();
    const rows = await this.prisma.proprietario.findMany({
      where: {
        email: { equals: normalized, mode: 'insensitive' },
        ...(tenantSlug ? { tenant: { slug: tenantSlug } } : {}),
        portalAcesso: { status: ProprietarioPortalStatus.ativo },
      },
      include: { portalAcesso: true },
      take: 2,
    });
    if (rows.length !== 1 || !rows[0].portalAcesso) {
      return {};
    }

    const rawToken = randomBytes(32).toString('hex');
    const hashedToken = createHash('sha256').update(rawToken).digest('hex');
    await this.prisma.proprietarioPortalAcesso.update({
      where: { id: rows[0].portalAcesso.id },
      data: {
        passwordResetToken: hashedToken,
        passwordResetExpires: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
      },
    });

    const isProd = this.config.get<string>('NODE_ENV') === 'production';
    return isProd ? {} : { resetToken: rawToken };
  }

  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const hashedToken = createHash('sha256').update(rawToken).digest('hex');
    const acesso = await this.prisma.proprietarioPortalAcesso.findFirst({
      where: {
        passwordResetToken: hashedToken,
        passwordResetExpires: { gt: new Date() },
      },
    });
    if (
      !acesso ||
      !this.tokensMatch(acesso.passwordResetToken, hashedToken)
    ) {
      throw new UnauthorizedException('Token inválido ou expirado.');
    }

    await this.prisma.proprietarioPortalAcesso.update({
      where: { id: acesso.id },
      data: {
        password: await bcrypt.hash(newPassword, SALT_ROUNDS),
        passwordResetToken: null,
        passwordResetExpires: null,
        hashedRefreshToken: null,
      },
    });
  }

  async setAcesso(
    proprietarioId: string,
    tenantId: string,
    dto: UpdateProprietarioPortalDto,
  ): Promise<{
    ativo: boolean;
    lastLoginAt: Date | null;
    senhaTemporaria?: string;
  }> {
    const proprietario = await this.prisma.proprietario.findFirst({
      where: { id: proprietarioId, tenantId },
      include: { portalAcesso: true },
    });
    if (!proprietario) {
      throw new BadRequestException('Proprietário não encontrado.');
    }

    if (dto.ativo) {
      const email = proprietario.email.trim();
      if (!email) {
        throw new BadRequestException(
          'Informe o e-mail do proprietário antes de ativar o portal.',
        );
      }
      let senha = dto.senha?.trim();
      let senhaTemporaria: string | undefined;
      if (dto.gerarSenhaTemporaria) {
        senhaTemporaria = this.generateTempPassword();
        senha = senhaTemporaria;
      } else if (!senha && !proprietario.portalAcesso) {
        senhaTemporaria = this.generateTempPassword();
        senha = senhaTemporaria;
      }
      if (!senha && !proprietario.portalAcesso?.password) {
        throw new BadRequestException(
          'Defina uma senha para ativar o acesso ao portal.',
        );
      }

      const passwordHash = senha
        ? await bcrypt.hash(senha, SALT_ROUNDS)
        : proprietario.portalAcesso!.password;

      const saved = await this.prisma.proprietarioPortalAcesso.upsert({
        where: { proprietarioId },
        create: {
          tenantId,
          proprietarioId,
          password: passwordHash,
          status: ProprietarioPortalStatus.ativo,
        },
        update: {
          status: ProprietarioPortalStatus.ativo,
          ...(senha ? { password: passwordHash, hashedRefreshToken: null } : {}),
        },
      });

      return {
        ativo: true,
        lastLoginAt: saved.lastLoginAt,
        ...(senhaTemporaria ? { senhaTemporaria } : {}),
      };
    }

    if (proprietario.portalAcesso) {
      const saved = await this.prisma.proprietarioPortalAcesso.update({
        where: { id: proprietario.portalAcesso.id },
        data: {
          status: ProprietarioPortalStatus.inativo,
          hashedRefreshToken: null,
        },
      });
      return { ativo: false, lastLoginAt: saved.lastLoginAt };
    }

    return { ativo: false, lastLoginAt: null };
  }

  exposeAcesso(acesso: {
    status: ProprietarioPortalStatus;
    lastLoginAt: Date | null;
  } | null) {
    return {
      ativo: acesso?.status === ProprietarioPortalStatus.ativo,
      lastLoginAt: acesso?.lastLoginAt ?? null,
    };
  }

  private generateTempPassword(): string {
    return `Portal1a${randomBytes(3).toString('hex')}`;
  }

  private tokensMatch(stored: string | null, provided: string): boolean {
    if (!stored) return false;
    const a = Buffer.from(stored);
    const b = Buffer.from(provided);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  private async issueTokens(session: PortalProprietarioSession): Promise<PortalAuthTokens> {
    const payload: PortalJwtPayload = {
      sub: session.acessoId,
      proprietarioId: session.proprietarioId,
      tenantId: session.tenantId,
      email: session.email,
      name: session.name,
      kind: PORTAL_JWT_KIND,
    };
    const accessExpiresIn = this.config.get<string>(
      'JWT_ACCESS_EXPIRES_IN',
      '15m',
    );
    const refreshExpiresIn = this.config.get<string>(
      'JWT_REFRESH_EXPIRES_IN',
      '7d',
    );
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(payload, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: accessExpiresIn as unknown as number,
      }),
      this.jwt.signAsync(payload, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: refreshExpiresIn as unknown as number,
      }),
    ]);
    return { accessToken, refreshToken };
  }
}
