import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ApiAplicacaoStatus, ApiAutorizacaoStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { SALT_ROUNDS } from '../config/security.constants';
import { PrismaService } from '../prisma/prisma.service';
import { assertScopes, type ApiScope } from './api-scopes';
import { generateClientId, generateClientSecret } from './api-token';

@Injectable()
export class ApiAppsService {
  constructor(private readonly prisma: PrismaService) {}

  async criar(input: {
    nome: string;
    descricao?: string;
    tenantId: string;
    scopes: string[];
  }) {
    const scopes = this.scopesOrThrow(input.scopes);
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: input.tenantId },
      select: { id: true },
    });
    if (!tenant) throw new NotFoundException('Imobiliária não encontrada.');
    const secret = generateClientSecret();
    const created = await this.prisma.apiAplicacao.create({
      data: {
        nome: input.nome.trim(),
        descricao: input.descricao?.trim() ?? '',
        clientId: generateClientId(),
        segredoHash: await bcrypt.hash(secret, SALT_ROUNDS),
        autorizacoes: {
          create: {
            tenantId: input.tenantId,
            scopes,
            status: ApiAutorizacaoStatus.ativa,
          },
        },
      },
      select: { id: true, nome: true, clientId: true, status: true },
    });
    return { ...created, clientSecret: secret };
  }

  async rotacionar(aplicacaoId: string) {
    const app = await this.prisma.apiAplicacao.findUnique({
      where: { id: aplicacaoId },
      select: { id: true, status: true },
    });
    if (!app) throw new NotFoundException('Aplicação não encontrada.');
    if (app.status !== ApiAplicacaoStatus.ativa) {
      throw new BadRequestException('Aplicação inativa.');
    }
    const secret = generateClientSecret();
    await this.prisma.apiAplicacao.update({
      where: { id: aplicacaoId },
      data: {
        segredoHash: await bcrypt.hash(secret, SALT_ROUNDS),
        credencialVersao: { increment: 1 },
      },
    });
    return { aplicacaoId, clientSecret: secret };
  }

  async revogarAplicacao(aplicacaoId: string) {
    const app = await this.prisma.apiAplicacao.findUnique({
      where: { id: aplicacaoId },
      select: { id: true },
    });
    if (!app) throw new NotFoundException('Aplicação não encontrada.');
    await this.prisma.apiAplicacao.update({
      where: { id: aplicacaoId },
      data: { status: ApiAplicacaoStatus.inativa },
    });
    return { aplicacaoId, status: ApiAplicacaoStatus.inativa };
  }

  async conceder(input: {
    aplicacaoId: string;
    tenantId: string;
    scopes: string[];
  }) {
    const scopes = this.scopesOrThrow(input.scopes);
    const app = await this.prisma.apiAplicacao.findUnique({
      where: { id: input.aplicacaoId },
      select: { id: true },
    });
    if (!app) throw new NotFoundException('Aplicação não encontrada.');
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: input.tenantId },
      select: { id: true },
    });
    if (!tenant) throw new NotFoundException('Imobiliária não encontrada.');
    const grant = await this.prisma.apiAutorizacao.upsert({
      where: {
        aplicacaoId_tenantId: {
          aplicacaoId: input.aplicacaoId,
          tenantId: input.tenantId,
        },
      },
      create: {
        aplicacaoId: input.aplicacaoId,
        tenantId: input.tenantId,
        scopes,
        status: ApiAutorizacaoStatus.ativa,
      },
      update: {
        scopes,
        status: ApiAutorizacaoStatus.ativa,
        revokedAt: null,
      },
      select: { id: true, tenantId: true, scopes: true, status: true },
    });
    return grant;
  }

  async revogarAutorizacao(autorizacaoId: string) {
    const grant = await this.prisma.apiAutorizacao.findUnique({
      where: { id: autorizacaoId },
      select: { id: true },
    });
    if (!grant) throw new NotFoundException('Autorização não encontrada.');
    await this.prisma.apiAutorizacao.update({
      where: { id: autorizacaoId },
      data: { status: ApiAutorizacaoStatus.revogada, revokedAt: new Date() },
    });
    return { autorizacaoId, status: ApiAutorizacaoStatus.revogada };
  }

  private scopesOrThrow(scopes: string[]): ApiScope[] {
    try {
      return assertScopes(scopes);
    } catch (err) {
      throw new BadRequestException(
        err instanceof Error ? err.message : 'Escopo inválido.',
      );
    }
  }
}
