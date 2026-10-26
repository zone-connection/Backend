import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Prisma,
  Role,
  TwoFactorAuditAcao,
  TwoFactorStatus,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import {
  RISK_TERMS_TEXT,
  RISK_TERMS_VERSION,
  decryptSecret,
  encryptSecret,
  generateRecoveryCodes,
  generateTotpSecret,
  otpauthUrl,
  totpMatches,
} from './totp.util';

const SALT_ROUNDS = 10;

@Injectable()
export class Seguranca2faService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  terms() {
    return { version: RISK_TERMS_VERSION, text: RISK_TERMS_TEXT };
  }

  async estado(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        role: true,
        twoFactorStatus: true,
        twoFactorDecidedAt: true,
        twoFactorChangedAt: true,
        riskTermsVersion: true,
        riskAcceptedAt: true,
        totpBackupHashes: true,
      },
    });
    if (!user) throw new NotFoundException('Usuário não encontrado.');
    return {
      role: user.role,
      twoFactorStatus: user.twoFactorStatus,
      twoFactorDecidedAt: user.twoFactorDecidedAt,
      twoFactorChangedAt: user.twoFactorChangedAt,
      riskTermsVersion: user.riskTermsVersion,
      riskAcceptedAt: user.riskAcceptedAt,
      codigoConfirmado: user.totpBackupHashes.length > 0,
    };
  }

  async preparar(userId: string) {
    const user = await this.requireAdmin(userId);
    const secret = generateTotpSecret();
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        totpSecretEnc: encryptSecret(secret, this.keyMaterial()),
        totpBackupHashes: [],
      },
    });
    return { secret, otpauthUrl: otpauthUrl(user.email, secret) };
  }

  async confirmar(userId: string, code: string) {
    const user = await this.requireAdmin(userId);
    if (!user.totpSecretEnc) {
      throw new BadRequestException(
        'Gere o segredo do autenticador antes de confirmar o código.',
      );
    }
    const secret = decryptSecret(user.totpSecretEnc, this.keyMaterial());
    if (!totpMatches(secret, code)) {
      throw new BadRequestException('Código do autenticador inválido.');
    }
    const recovery = generateRecoveryCodes();
    const hashes = await Promise.all(
      recovery.map((item) => bcrypt.hash(item, SALT_ROUNDS)),
    );
    const inicial = user.twoFactorStatus === TwoFactorStatus.pendente;
    if (inicial) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { totpBackupHashes: hashes },
      });
      return {
        recoveryCodes: recovery,
        twoFactorStatus: TwoFactorStatus.pendente,
        codigoConfirmado: true,
      };
    }
    const now = new Date();
    const acao = TwoFactorAuditAcao.ativar;

    const updated = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.user.update({
        where: { id: user.id },
        data: {
          twoFactorStatus: TwoFactorStatus.ativo,
          totpBackupHashes: hashes,
          twoFactorDecidedAt: user.twoFactorDecidedAt ?? now,
          twoFactorChangedAt: now,
          riskTermsVersion: null,
          riskAcceptedAt: null,
        },
      });
      const event = await tx.twoFactorAuditEvent.create({
        data: {
          userId: user.id,
          tenantId: user.tenantId,
          acao,
        },
      });
      await this.notify(tx, event.id, saved.name, user.tenantId, 'ativar', now);
      return saved;
    });

    return {
      recoveryCodes: recovery,
      twoFactorStatus: updated.twoFactorStatus,
    };
  }

  async manter(userId: string) {
    const user = await this.requireAdmin(userId);
    if (user.totpBackupHashes.length === 0 || !user.totpSecretEnc) {
      throw new BadRequestException(
        'Confirme o código do autenticador antes de manter o 2FA.',
      );
    }
    if (user.twoFactorStatus === TwoFactorStatus.ativo) {
      return { twoFactorStatus: user.twoFactorStatus };
    }
    const now = new Date();
    const inicial = user.twoFactorStatus === TwoFactorStatus.pendente;
    const updated = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.user.update({
        where: { id: user.id },
        data: {
          twoFactorStatus: TwoFactorStatus.ativo,
          twoFactorDecidedAt: user.twoFactorDecidedAt ?? now,
          twoFactorChangedAt: now,
          riskTermsVersion: null,
          riskAcceptedAt: null,
        },
      });
      const event = await tx.twoFactorAuditEvent.create({
        data: {
          userId: user.id,
          tenantId: user.tenantId,
          acao: inicial
            ? TwoFactorAuditAcao.decisao_ativar
            : TwoFactorAuditAcao.ativar,
        },
      });
      await this.notify(tx, event.id, saved.name, user.tenantId, 'ativar', now);
      return saved;
    });
    return { twoFactorStatus: updated.twoFactorStatus };
  }

  async aceitarRisco(userId: string, aceito: boolean) {
    if (!aceito) {
      throw new BadRequestException('Confirme a leitura dos termos para continuar.');
    }
    const user = await this.requireAdmin(userId);
    if (user.twoFactorStatus === TwoFactorStatus.desativado) {
      throw new BadRequestException('A autenticação de dois fatores já está desativada.');
    }
    if (
      user.twoFactorStatus === TwoFactorStatus.pendente &&
      user.totpBackupHashes.length === 0
    ) {
      throw new BadRequestException(
        'Confirme o código do autenticador antes de desativar o 2FA.',
      );
    }
    const inicial = user.twoFactorStatus === TwoFactorStatus.pendente;
    const now = new Date();
    const acao = inicial
      ? TwoFactorAuditAcao.decisao_desativar
      : TwoFactorAuditAcao.desativar;

    const updated = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.user.update({
        where: { id: user.id },
        data: {
          twoFactorStatus: TwoFactorStatus.desativado,
          totpSecretEnc: null,
          totpBackupHashes: [],
          twoFactorDecidedAt: user.twoFactorDecidedAt ?? now,
          twoFactorChangedAt: now,
          riskTermsVersion: RISK_TERMS_VERSION,
          riskAcceptedAt: now,
        },
      });
      const event = await tx.twoFactorAuditEvent.create({
        data: {
          userId: user.id,
          tenantId: user.tenantId,
          acao,
          termsVersion: RISK_TERMS_VERSION,
        },
      });
      await this.notify(tx, event.id, saved.name, user.tenantId, 'desativar', now);
      return saved;
    });

    return { twoFactorStatus: updated.twoFactorStatus };
  }

  async verifyLoginCode(
    user: {
      id: string;
      totpSecretEnc: string | null;
      totpBackupHashes: string[];
    },
    code: string,
  ): Promise<boolean> {
    const normalized = code.replace(/\s/g, '');
    if (user.totpSecretEnc && totpMatches(decryptSecret(user.totpSecretEnc, this.keyMaterial()), normalized)) {
      return true;
    }
    for (let i = 0; i < user.totpBackupHashes.length; i++) {
      const hash = user.totpBackupHashes[i];
      if (await bcrypt.compare(normalized.toUpperCase(), hash)) {
        const next = user.totpBackupHashes.filter((_, idx) => idx !== i);
        await this.prisma.user.update({
          where: { id: user.id },
          data: { totpBackupHashes: next },
        });
        return true;
      }
    }
    return false;
  }

  async painel(query: {
    estado?: TwoFactorStatus;
    tenantId?: string;
    role?: Role;
    from?: string;
    to?: string;
  }) {
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;
    const where: Prisma.UserWhereInput = {
      role: Role.admin,
      ...(query.estado ? { twoFactorStatus: query.estado } : {}),
      ...(query.tenantId ? { tenantId: query.tenantId } : {}),
      ...(query.role ? { role: query.role } : {}),
      ...(from || to
        ? {
            twoFactorDecidedAt: {
              ...(from && !Number.isNaN(from.getTime()) ? { gte: from } : {}),
              ...(to && !Number.isNaN(to.getTime()) ? { lte: to } : {}),
            },
          }
        : {}),
    };

    const [users, grouped, imobiliarias] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          tenantId: true,
          tenant: { select: { id: true, name: true } },
          twoFactorStatus: true,
          twoFactorDecidedAt: true,
          twoFactorChangedAt: true,
          riskTermsVersion: true,
          riskAcceptedAt: true,
        },
        orderBy: [{ twoFactorStatus: 'asc' }, { name: 'asc' }],
        take: 500,
      }),
      this.prisma.user.groupBy({
        by: ['twoFactorStatus'],
        where: { role: Role.admin },
        _count: { _all: true },
      }),
      this.prisma.tenant.findMany({
        where: { users: { some: { role: Role.admin } } },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    const count = (status: TwoFactorStatus) =>
      grouped.find((row) => row.twoFactorStatus === status)?._count._all ?? 0;

    return {
      totais: {
        usuarios: grouped.reduce((sum, row) => sum + row._count._all, 0),
        ativo: count(TwoFactorStatus.ativo),
        desativado: count(TwoFactorStatus.desativado),
        pendente: count(TwoFactorStatus.pendente),
      },
      imobiliarias,
      usuarios: users.map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId,
        tenantName: user.tenant?.name ?? 'Plataforma',
        estado: user.twoFactorStatus,
        decidedAt: user.twoFactorDecidedAt,
        changedAt: user.twoFactorChangedAt,
        riskTermsVersion: user.riskTermsVersion,
        riskAcceptedAt: user.riskAcceptedAt,
      })),
    };
  }

  async historico(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, role: Role.admin },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        twoFactorStatus: true,
        tenant: { select: { name: true } },
      },
    });
    if (!user) throw new NotFoundException('Administrador não encontrado.');
    const eventos = await this.prisma.twoFactorAuditEvent.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        acao: true,
        termsVersion: true,
        createdAt: true,
      },
    });
    return {
      usuario: {
        ...user,
        tenantName: user.tenant?.name ?? 'Plataforma',
      },
      eventos,
    };
  }

  async avisos(superAdminId: string) {
    return this.prisma.platformNotificacao.findMany({
      where: { userId: superAdminId },
      orderBy: { createdAt: 'desc' },
      take: 40,
    });
  }

  async marcarAviso(superAdminId: string, id: string) {
    const item = await this.prisma.platformNotificacao.findFirst({
      where: { id, userId: superAdminId },
    });
    if (!item) throw new NotFoundException('Aviso não encontrado.');
    return this.prisma.platformNotificacao.update({
      where: { id },
      data: { lida: true },
    });
  }

  private async requireAdmin(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.role !== Role.admin) {
      throw new ForbiddenException(
        'A decisão de 2FA vale para o administrador da imobiliária.',
      );
    }
    return user;
  }

  private keyMaterial() {
    return this.config.getOrThrow<string>('JWT_ACCESS_SECRET');
  }

  private async notify(
    tx: Prisma.TransactionClient,
    eventoId: string,
    nome: string,
    tenantId: string | null,
    tipo: 'ativar' | 'desativar',
    quando: Date,
  ) {
    const supers = await tx.user.findMany({
      where: { role: Role.super_admin, status: 'ativo' },
      select: { id: true },
    });
    if (supers.length === 0) return;
    const tenant = tenantId
      ? await tx.tenant.findUnique({
          where: { id: tenantId },
          select: { name: true },
        })
      : null;
    const imobiliaria = tenant?.name ?? 'Plataforma';
    const hora = quando.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const desativou = tipo === 'desativar';
    await tx.platformNotificacao.createMany({
      data: supers.map((admin) => ({
        userId: admin.id,
        tipo: desativou ? 'two_factor_desativado' : 'two_factor_ativado',
        titulo: desativou ? 'Atenção' : 'Proteção ativa',
        corpo: desativou
          ? `O usuário ${nome} desativou a autenticação de dois fatores. Imobiliária: ${imobiliaria} · ${hora}`
          : `O usuário ${nome} ativou e confirmou a autenticação de dois fatores. O evento fica disponível no histórico de segurança.`,
        eventoId: `${eventoId}:${admin.id}`,
      })),
    });
  }
}
