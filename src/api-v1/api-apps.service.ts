import { randomBytes } from 'crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiAplicacaoStatus,
  ApiAutorizacaoStatus,
  Prisma,
  Role,
  UserStatus,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { SALT_ROUNDS } from '../config/security.constants';
import { PrismaService } from '../prisma/prisma.service';
import { assertScopes, type ApiScope } from './api-scopes';
import { API_TECNICO_NOME, emailTecnico } from './api-tecnico';
import { generateClientId, generateClientSecret } from './api-token';

@Injectable()
export class ApiAppsService {
  constructor(private readonly prisma: PrismaService) {}

  listar() {
    return this.prisma.apiAplicacao.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        nome: true,
        descricao: true,
        status: true,
        clientId: true,
        createdAt: true,
        autorizacoes: {
          select: {
            id: true,
            tenantId: true,
            scopes: true,
            status: true,
            tenant: { select: { name: true, slug: true } },
          },
        },
        webhooks: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            url: true,
            eventos: true,
            ativo: true,
            createdAt: true,
          },
        },
      },
    });
  }

  async tenantAtivo(aplicacaoId: string) {
    const app = await this.prisma.apiAplicacao.findUnique({
      where: { id: aplicacaoId },
      select: {
        id: true,
        autorizacoes: {
          where: { status: ApiAutorizacaoStatus.ativa },
          select: { tenantId: true },
          take: 1,
        },
      },
    });
    if (!app) throw new NotFoundException('Aplicação não encontrada.');
    const tenantId = app.autorizacoes[0]?.tenantId;
    if (!tenantId) {
      throw new BadRequestException('Aplicação sem imobiliária ativa.');
    }
    return { aplicacaoId: app.id, tenantId };
  }

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
    const dados = {
      nome: input.nome.trim(),
      descricao: input.descricao?.trim() ?? '',
      clientId: generateClientId(),
      segredoHash: await bcrypt.hash(secret, SALT_ROUNDS),
      tenantId: input.tenantId,
      scopes,
    };
    const created = await this.transacionar(input.tenantId, (tx) =>
      this.autorizarAplicacao(tx, dados),
    );
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
    return this.transacionar(input.tenantId, (tx) =>
      this.autorizar(tx, input.aplicacaoId, input.tenantId, scopes),
    );
  }

  /**
   * Uma transação por autorização. Se outra autorização do mesmo Tenant
   * criar o usuário técnico no mesmo instante, esta transação é desfeita
   * e a autorização é gravada de novo, reutilizando o usuário já existente.
   */
  private async transacionar<T>(
    tenantId: string,
    gravar: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.prisma.$transaction(gravar);
    } catch (err) {
      if (!conflitoEmail(err)) throw err;
      const existente = await this.prisma.user.findFirst({
        where: { email: emailTecnico(tenantId), tenantId },
        select: { id: true },
      });
      if (!existente) throw err;
      return this.prisma.$transaction(gravar);
    }
  }

  private async autorizarAplicacao(
    tx: Prisma.TransactionClient,
    dados: {
      nome: string;
      descricao: string;
      clientId: string;
      segredoHash: string;
      tenantId: string;
      scopes: ApiScope[];
    },
  ) {
    await this.garantirTecnico(tx, dados.tenantId);
    return tx.apiAplicacao.create({
      data: {
        nome: dados.nome,
        descricao: dados.descricao,
        clientId: dados.clientId,
        segredoHash: dados.segredoHash,
        autorizacoes: {
          create: {
            tenantId: dados.tenantId,
            scopes: dados.scopes,
            status: ApiAutorizacaoStatus.ativa,
          },
        },
      },
      select: { id: true, nome: true, clientId: true, status: true },
    });
  }

  private async autorizar(
    tx: Prisma.TransactionClient,
    aplicacaoId: string,
    tenantId: string,
    scopes: ApiScope[],
  ) {
    await this.garantirTecnico(tx, tenantId);
    return tx.apiAutorizacao.upsert({
      where: { aplicacaoId_tenantId: { aplicacaoId, tenantId } },
      create: {
        aplicacaoId,
        tenantId,
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
  }

  private async garantirTecnico(tx: Prisma.TransactionClient, tenantId: string) {
    const email = emailTecnico(tenantId);
    const existente = await tx.user.findFirst({
      where: { tenantId, email },
      select: { id: true },
    });
    if (existente) return existente;
    const senha = randomBytes(32).toString('base64url');
    return tx.user.create({
      data: {
        tenantId,
        name: API_TECNICO_NOME,
        email,
        password: await bcrypt.hash(senha, SALT_ROUNDS),
        role: Role.assistente,
        status: UserStatus.ativo,
        permissions: {},
      },
      select: { id: true },
    });
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

function conflitoEmail(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (err.code !== 'P2002') return false;
  const target = err.meta?.target;
  const texto = Array.isArray(target) ? target.join(',') : String(target ?? '');
  return texto.toLowerCase().includes('email');
}
