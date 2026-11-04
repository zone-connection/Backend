import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  MfaAuditEvent,
  MfaDecision,
  Role,
  User,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import QRCode from 'qrcode';
import { PrismaService } from '../../prisma/prisma.service';
import { decryptSecret, encryptionKey, encryptSecret } from './mfa-crypto';
import { canDisableMfa, mfaGateFor, mfaPolicyForRole } from './mfa.policy';
import {
  generateTotpSecret,
  otpauthUrl,
  totpMatches,
} from './totp';

export type MfaPendingKind = 'mfa_verify' | 'mfa_setup' | 'mfa_decision';

const PENDING_TTL = '5m';
const MAX_MFA_FAILURES = 5;
const MFA_LOCK_MS = 15 * 60 * 1000;

@Injectable()
export class MfaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  gate(user: Pick<User, 'role' | 'totpEnabledAt' | 'mfaDecision'>) {
    return mfaGateFor({
      role: user.role,
      totpEnabledAt: user.totpEnabledAt,
      mfaDecision: user.mfaDecision,
    });
  }

  async issuePending(userId: string, kind: MfaPendingKind): Promise<string> {
    return this.jwt.signAsync(
      { sub: userId, kind },
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: PENDING_TTL,
      },
    );
  }

  async readPending(token: string, kind: MfaPendingKind): Promise<User> {
    let payload: { sub?: string; kind?: string };
    try {
      payload = await this.jwt.verifyAsync(token, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('A etapa de verificação expirou. Entre novamente.');
    }
    if (!payload.sub || payload.kind !== kind) {
      throw new UnauthorizedException('Verificação inválida.');
    }
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) throw new UnauthorizedException('Verificação inválida.');
    this.assertNotLocked(user);
    return user;
  }

  async beginSetup(user: User): Promise<{ qrDataUrl: string }> {
    const secret = generateTotpSecret();
    await this.prisma.user.update({
      where: { id: user.id },
      data: { totpPendingEnc: encryptSecret(secret, this.key()) },
    });
    const url = otpauthUrl(user.email, secret);
    const qrDataUrl = await QRCode.toDataURL(url, { margin: 1, width: 240 });
    return { qrDataUrl };
  }

  async confirmSetup(user: User, code: string): Promise<{ recoveryCodes: string[] }> {
    if (!user.totpPendingEnc) {
      throw new BadRequestException('Comece a configuração antes de confirmar o código.');
    }
    const secret = decryptSecret(user.totpPendingEnc, this.key());
    const match = totpMatches(secret, code, null);
    if (!match.ok) {
      await this.registerFailure(user);
      throw new UnauthorizedException('Código inválido.');
    }
    const recoveryCodes = this.newRecoveryCodes();
    await this.prisma.$transaction([
      this.prisma.userMfaRecoveryCode.deleteMany({ where: { userId: user.id } }),
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          totpSecretEnc: user.totpPendingEnc,
          totpPendingEnc: null,
          totpEnabledAt: new Date(),
          totpDisabledAt: null,
          totpLastStep: match.step,
          mfaFailedAttempts: 0,
          mfaLockedUntil: null,
          mfaDecision: MfaDecision.manter,
          mfaDecisionAt: user.mfaDecisionAt ?? new Date(),
          hashedRefreshToken: null,
        },
      }),
      this.prisma.userMfaRecoveryCode.createMany({
        data: recoveryCodes.map((code) => ({
          userId: user.id,
          codeHash: this.hashRecovery(user.id, code),
        })),
      }),
      this.prisma.userMfaAudit.create({
        data: {
          userId: user.id,
          event: user.totpEnabledAt
            ? MfaAuditEvent.regeneracao
            : MfaAuditEvent.ativacao,
        },
      }),
    ]);
    return { recoveryCodes };
  }

  async verifyLoginCode(user: User, code: string): Promise<void> {
    await this.acceptTotp(user, code);
  }

  async recover(user: User, recoveryCode: string): Promise<void> {
    const hash = this.hashRecovery(user.id, recoveryCode.trim().toUpperCase());
    const row = await this.prisma.userMfaRecoveryCode.findFirst({
      where: { userId: user.id, codeHash: hash, usedAt: null },
    });
    if (!row) {
      await this.registerFailure(user);
      throw new UnauthorizedException('Código de recuperação inválido.');
    }
    await this.prisma.$transaction([
      this.prisma.userMfaRecoveryCode.update({
        where: { id: row.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: user.id },
        data: { mfaFailedAttempts: 0, mfaLockedUntil: null },
      }),
      this.prisma.userMfaAudit.create({
        data: { userId: user.id, event: MfaAuditEvent.recuperacao },
      }),
    ]);
  }

  async decide(
    user: User,
    choice: 'manter' | 'recusar',
    password: string,
  ): Promise<void> {
    if (user.role !== Role.admin) {
      throw new ForbiddenException('Esta escolha não se aplica ao seu perfil.');
    }
    if (user.mfaDecision) {
      throw new BadRequestException('A decisão de segurança já foi registrada.');
    }
    const passwordOk = await bcrypt.compare(password, user.password);
    if (!passwordOk) throw new UnauthorizedException('Senha atual incorreta.');
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        mfaDecision: choice === 'manter' ? MfaDecision.manter : MfaDecision.recusar,
        mfaDecisionAt: new Date(),
      },
    });
    await this.audit(user.id, MfaAuditEvent.decisao);
  }

  async disable(user: User, password: string, code: string): Promise<void> {
    if (!canDisableMfa(user.role)) {
      throw new ForbiddenException(
        'O super admin não pode desativar a autenticação em duas etapas.',
      );
    }
    if (!user.totpEnabledAt) {
      throw new BadRequestException('A autenticação em duas etapas não está ativa.');
    }
    const passwordOk = await bcrypt.compare(password, user.password);
    if (!passwordOk) throw new UnauthorizedException('Senha atual incorreta.');
    await this.acceptTotp(user, code);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        totpSecretEnc: null,
        totpPendingEnc: null,
        totpEnabledAt: null,
        totpDisabledAt: new Date(),
        totpLastStep: null,
        hashedRefreshToken: null,
        mfaDecision:
          user.role === Role.admin ? MfaDecision.recusar : user.mfaDecision,
        mfaDecisionAt: new Date(),
      },
    });
    await this.prisma.userMfaRecoveryCode.deleteMany({ where: { userId: user.id } });
    await this.audit(user.id, MfaAuditEvent.desativacao);
  }

  async status(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        role: true,
        totpEnabledAt: true,
        totpDisabledAt: true,
        mfaDecision: true,
        mfaDecisionAt: true,
      },
    });
    if (!user) throw new UnauthorizedException('Sessão inválida.');
    const recoveryLeft = await this.prisma.userMfaRecoveryCode.count({
      where: { userId, usedAt: null },
    });
    return {
      policy: mfaPolicyForRole(user.role),
      enabled: user.totpEnabledAt != null,
      enabledAt: user.totpEnabledAt,
      disabledAt: user.totpDisabledAt,
      decision: user.mfaDecision,
      decisionAt: user.mfaDecisionAt,
      canDisable: canDisableMfa(user.role),
      recoveryCodesLeft: recoveryLeft,
      authenticator: 'Aplicativo autenticador (TOTP)',
    };
  }

  private async acceptTotp(user: User, code: string): Promise<void> {
    if (!user.totpSecretEnc) {
      throw new BadRequestException('A autenticação em duas etapas não está ativa.');
    }
    const secret = decryptSecret(user.totpSecretEnc, this.key());
    const match = totpMatches(secret, code, user.totpLastStep);
    if (!match.ok) {
      await this.registerFailure(user);
      throw new UnauthorizedException('Código inválido.');
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        totpLastStep: match.step,
        mfaFailedAttempts: 0,
        mfaLockedUntil: null,
      },
    });
  }

  private assertNotLocked(user: User) {
    if (user.mfaLockedUntil && user.mfaLockedUntil.getTime() > Date.now()) {
      throw new ForbiddenException(
        'Muitas tentativas de código. Aguarde alguns minutos e tente de novo.',
      );
    }
  }

  private async registerFailure(user: User) {
    const attempts = user.mfaFailedAttempts + 1;
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        mfaFailedAttempts: attempts,
        mfaLockedUntil:
          attempts >= MAX_MFA_FAILURES
            ? new Date(Date.now() + MFA_LOCK_MS)
            : user.mfaLockedUntil,
      },
    });
    await this.audit(user.id, MfaAuditEvent.falha);
  }

  private async audit(userId: string, event: MfaAuditEvent) {
    await this.prisma.userMfaAudit.create({ data: { userId, event } });
  }

  private newRecoveryCodes(): string[] {
    return Array.from({ length: 8 }, () => {
      const raw = randomBytes(4).toString('hex').toUpperCase();
      return `${raw.slice(0, 4)}-${raw.slice(4)}`;
    });
  }

  private hashRecovery(userId: string, code: string): string {
    return createHash('sha256').update(`${userId}:${code}`).digest('hex');
  }

  private key(): Buffer {
    const dedicated = this.config.get<string>('MFA_ENCRYPTION_KEY');
    const source =
      dedicated && dedicated.trim().length > 0
        ? dedicated
        : this.config.getOrThrow<string>('JWT_ACCESS_SECRET');
    return encryptionKey(source);
  }
}
