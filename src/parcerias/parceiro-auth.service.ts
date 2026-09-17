import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { SALT_ROUNDS } from '../config/security.constants';
import { PrismaService } from '../prisma/prisma.service';
import {
  PARCEIRO_JWT_KIND,
  type PortalParceiroSession,
} from './parceiro.types';

const GENERIC = 'Credenciais inválidas.';
const DUMMY_HASH = bcrypt.hashSync('timing-attack-placeholder', SALT_ROUNDS);

@Injectable()
export class ParceiroAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(email: string, password: string) {
    const normalized = email.toLowerCase().trim();
    const row = await this.prisma.corretorParceiro.findFirst({
      where: { email: { equals: normalized, mode: 'insensitive' } },
    });
    const ok = await bcrypt.compare(password, row?.password ?? DUMMY_HASH);
    if (!row || !row.ativo || !ok) {
      throw new UnauthorizedException(GENERIC);
    }

    const tokens = await this.issueTokens({
      parceiroId: row.id,
      email: row.email,
      name: row.nome,
    });
    await this.prisma.corretorParceiro.update({
      where: { id: row.id },
      data: {
        hashedRefreshToken: createHash('sha256')
          .update(tokens.refreshToken)
          .digest('hex'),
        lastLoginAt: new Date(),
      },
    });

    return {
      ...tokens,
      parceiro: { id: row.id, nome: row.nome, email: row.email },
    };
  }

  async refresh(refreshToken: string | undefined) {
    if (!refreshToken) throw new UnauthorizedException('Sessão inválida.');
    let payload: { sub?: string; kind?: string };
    try {
      payload = await this.jwt.verifyAsync(refreshToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Token inválido.');
    }
    if (payload.kind !== PARCEIRO_JWT_KIND || !payload.sub) {
      throw new UnauthorizedException('Token inválido.');
    }
    const row = await this.prisma.corretorParceiro.findFirst({
      where: { id: payload.sub, ativo: true },
    });
    const hashed = createHash('sha256').update(refreshToken).digest('hex');
    if (!row || !this.tokensMatch(row.hashedRefreshToken, hashed)) {
      throw new UnauthorizedException('Sessão inválida.');
    }
    const tokens = await this.issueTokens({
      parceiroId: row.id,
      email: row.email,
      name: row.nome,
    });
    await this.prisma.corretorParceiro.update({
      where: { id: row.id },
      data: {
        hashedRefreshToken: createHash('sha256')
          .update(tokens.refreshToken)
          .digest('hex'),
      },
    });
    return tokens;
  }

  async logout(parceiroId: string | undefined) {
    if (!parceiroId) return;
    await this.prisma.corretorParceiro.updateMany({
      where: { id: parceiroId },
      data: { hashedRefreshToken: null },
    });
  }

  me(session: PortalParceiroSession) {
    return {
      id: session.parceiroId,
      nome: session.name,
      email: session.email,
    };
  }

  async changePassword(
    session: PortalParceiroSession,
    senhaAtual: string,
    senhaNova: string,
  ) {
    const row = await this.prisma.corretorParceiro.findFirst({
      where: { id: session.parceiroId },
    });
    if (!row) throw new UnauthorizedException(GENERIC);
    const ok = await bcrypt.compare(senhaAtual, row.password);
    if (!ok) throw new ForbiddenException('Senha atual incorreta.');
    await this.prisma.corretorParceiro.update({
      where: { id: row.id },
      data: {
        password: await bcrypt.hash(senhaNova, SALT_ROUNDS),
        hashedRefreshToken: null,
      },
    });
  }

  generateTempPassword() {
    return `Parce1a${randomBytes(3).toString('hex')}`;
  }

  hashPassword(plain: string) {
    return bcrypt.hash(plain, SALT_ROUNDS);
  }

  private tokensMatch(stored: string | null, provided: string) {
    if (!stored) return false;
    const a = Buffer.from(stored);
    const b = Buffer.from(provided);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  private async issueTokens(session: PortalParceiroSession) {
    const payload = {
      sub: session.parceiroId,
      email: session.email,
      name: session.name,
      kind: PARCEIRO_JWT_KIND,
    };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(payload, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.config.get<string>(
          'JWT_ACCESS_EXPIRES_IN',
          '15m',
        ) as unknown as number,
      }),
      this.jwt.signAsync(payload, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.config.get<string>(
          'JWT_REFRESH_EXPIRES_IN',
          '7d',
        ) as unknown as number,
      }),
    ]);
    return { accessToken, refreshToken };
  }
}
