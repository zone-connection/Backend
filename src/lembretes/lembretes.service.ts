import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { LembretePessoalRecorrencia, Prisma } from '@prisma/client';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { requireTenantId } from '../common/utils/tenant';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLembreteDto, UpdateLembreteDto } from './dto/lembrete.dto';
import { lembreteEstaPendente } from './lembrete-recorrencia.util';
import {
  ensureLembretesPessoaisSchema,
  isLembretesSchemaMissing,
} from './lembretes.schema';

const MAX_LEMBRETES = 30;

const select = {
  id: true,
  titulo: true,
  descricao: true,
  ativo: true,
  recorrencia: true,
  reconhecidoEm: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.LembretePessoalSelect;

@Injectable()
export class LembretesService {
  private readonly logger = new Logger(LembretesService.name);
  private schemaReady = false;

  constructor(private readonly prisma: PrismaService) {}

  async list(requester: AuthenticatedUser) {
    try {
      const tenantId = requireTenantId(requester);
      return await this.withSchema(
        () =>
          this.prisma.lembretePessoal.findMany({
            where: { tenantId, userId: requester.id },
            select,
            orderBy: [{ ativo: 'desc' }, { createdAt: 'desc' }],
          }),
        [],
      );
    } catch (err) {
      this.logger.error(
        'Falha ao listar lembretes.',
        err instanceof Error ? err.stack : err,
      );
      return [];
    }
  }

  async pendentes(requester: AuthenticatedUser) {
    let rows: Prisma.LembretePessoalGetPayload<{ select: typeof select }>[];
    try {
      const tenantId = requireTenantId(requester);
      rows = await this.withSchema(
        () =>
          this.prisma.lembretePessoal.findMany({
            where: { tenantId, userId: requester.id, ativo: true },
            select,
            orderBy: { createdAt: 'asc' },
          }),
        [],
      );
    } catch (err) {
      this.logger.error(
        'Falha ao listar lembretes pendentes.',
        err instanceof Error ? err.stack : err,
      );
      return [];
    }
    const agora = new Date();
    return rows.filter((row) =>
      lembreteEstaPendente(row.recorrencia, row.reconhecidoEm, agora),
    );
  }

  async create(dto: CreateLembreteDto, requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);
    const titulo = dto.titulo.trim();
    if (!titulo) throw new BadRequestException('Informe o título do lembrete.');

    const count = await this.withSchema(() =>
      this.prisma.lembretePessoal.count({
        where: { tenantId, userId: requester.id },
      }),
    );
    if (count >= MAX_LEMBRETES) {
      throw new BadRequestException(
        `Você pode ter no máximo ${MAX_LEMBRETES} lembretes.`,
      );
    }

    return this.withSchema(() =>
      this.prisma.lembretePessoal.create({
        data: {
          tenantId,
          userId: requester.id,
          titulo,
          descricao: dto.descricao?.trim() ?? '',
          recorrencia: dto.recorrencia ?? LembretePessoalRecorrencia.sempre,
        },
        select,
      }),
    );
  }

  async update(
    id: string,
    dto: UpdateLembreteDto,
    requester: AuthenticatedUser,
  ) {
    await this.ensureOwned(id, requester);
    const data: Prisma.LembretePessoalUpdateInput = {};
    if (dto.titulo !== undefined) {
      const titulo = dto.titulo.trim();
      if (!titulo) throw new BadRequestException('Informe o título do lembrete.');
      data.titulo = titulo;
    }
    if (dto.descricao !== undefined) data.descricao = dto.descricao.trim();
    if (dto.recorrencia !== undefined) data.recorrencia = dto.recorrencia;
    if (dto.ativo !== undefined) {
      data.ativo = dto.ativo;
      if (dto.ativo) data.reconhecidoEm = null;
    }
    return this.withSchema(() =>
      this.prisma.lembretePessoal.update({
        where: { id },
        data,
        select,
      }),
    );
  }

  async remove(id: string, requester: AuthenticatedUser) {
    await this.ensureOwned(id, requester);
    await this.withSchema(() =>
      this.prisma.lembretePessoal.delete({ where: { id } }),
    );
    return { ok: true };
  }

  async reconhecer(id: string, requester: AuthenticatedUser) {
    const owned = await this.ensureOwned(id, requester);
    return this.withSchema(() =>
      this.prisma.lembretePessoal.update({
        where: { id },
        data: {
          reconhecidoEm: new Date(),
          ...(owned.recorrencia === LembretePessoalRecorrencia.uma_vez
            ? { ativo: false }
            : {}),
        },
        select,
      }),
    );
  }

  async reconhecerPendentes(requester: AuthenticatedUser) {
    const due = await this.pendentes(requester);
    for (const item of due) {
      await this.reconhecer(item.id, requester);
    }
    return { ok: true, count: due.length };
  }

  private async ensureOwned(id: string, requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);
    const row = await this.withSchema(() =>
      this.prisma.lembretePessoal.findFirst({
        where: { id, tenantId, userId: requester.id },
        select: { id: true, recorrencia: true },
      }),
    );
    if (!row) throw new NotFoundException('Lembrete não encontrado.');
    return row;
  }

  private async withSchema<T>(run: () => Promise<T>, fallback?: T): Promise<T> {
    try {
      return await run();
    } catch (err) {
      if (!isLembretesSchemaMissing(err)) throw err;
      try {
        await ensureLembretesPessoaisSchema(this.prisma);
        this.schemaReady = true;
        return await run();
      } catch (ensureErr) {
        this.logger.error(
          'Tabela de lembretes pessoais indisponível.',
          ensureErr instanceof Error ? ensureErr.stack : ensureErr,
        );
        if (fallback !== undefined) return fallback;
        throw new ServiceUnavailableException(
          'Lembretes ainda não estão disponíveis neste ambiente. Tente de novo em instantes.',
        );
      }
    }
  }
}
