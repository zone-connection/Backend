import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role, TenantPlano, UserStatus } from '@prisma/client';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { requireTenantId } from '../common/utils/tenant';
import { isCorretorLike } from '../common/utils/roles';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateCadastroVendaDto,
  UpdateCadastroVendaDto,
} from './dto/cadastro-venda.dto';

const select = {
  id: true,
  clienteNome: true,
  telefone: true,
  construtoraId: true,
  empreendimentoId: true,
  corretorId: true,
  dataVenda: true,
  vgv: true,
  obs: true,
  createdAt: true,
  updatedAt: true,
  construtora: { select: { id: true, nome: true, cor: true } },
  empreendimento: { select: { id: true, nome: true } },
  corretor: { select: { id: true, name: true } },
  autor: { select: { id: true, name: true } },
} satisfies Prisma.CadastroVendaSelect;

@Injectable()
export class CadastroVendasService {
  constructor(private readonly prisma: PrismaService) {}

  async list(requester: AuthenticatedUser) {
    const tenantId = await this.assertBronze(requester);
    const where: Prisma.CadastroVendaWhereInput = { tenantId };
    if (isCorretorLike(requester.role)) {
      where.OR = [{ corretorId: requester.id }, { autorId: requester.id }];
    }
    return this.prisma.cadastroVenda.findMany({
      where,
      select,
      orderBy: { dataVenda: 'desc' },
    });
  }

  async create(dto: CreateCadastroVendaDto, requester: AuthenticatedUser) {
    const tenantId = await this.assertBronze(requester);
    const corretorId = isCorretorLike(requester.role)
      ? requester.id
      : (dto.corretorId ?? null);
    await this.assertCorretor(tenantId, corretorId);
    return this.prisma.cadastroVenda.create({
      data: {
        tenantId,
        autorId: requester.id,
        clienteNome: dto.clienteNome.trim(),
        telefone: dto.telefone?.trim() || null,
        construtoraId: dto.construtoraId || null,
        empreendimentoId: dto.empreendimentoId || null,
        corretorId,
        dataVenda: this.parseDate(dto.dataVenda),
        vgv: dto.vgv,
        obs: dto.obs?.trim() || null,
      },
      select,
    });
  }

  async update(
    id: string,
    dto: UpdateCadastroVendaDto,
    requester: AuthenticatedUser,
  ) {
    const tenantId = await this.assertBronze(requester);
    const current = await this.prisma.cadastroVenda.findFirst({
      where: { id, tenantId },
      select: { id: true, autorId: true, corretorId: true },
    });
    if (!current) throw new NotFoundException('Venda não encontrada.');
    this.assertCanEdit(requester, current);

    let corretorId = dto.corretorId === undefined ? undefined : dto.corretorId;
    if (isCorretorLike(requester.role)) corretorId = requester.id;
    if (corretorId) await this.assertCorretor(tenantId, corretorId);

    return this.prisma.cadastroVenda.update({
      where: { id },
      data: {
        ...(dto.clienteNome !== undefined
          ? { clienteNome: dto.clienteNome.trim() }
          : {}),
        ...(dto.telefone !== undefined
          ? { telefone: dto.telefone?.trim() || null }
          : {}),
        ...(dto.construtoraId !== undefined
          ? { construtoraId: dto.construtoraId || null }
          : {}),
        ...(dto.empreendimentoId !== undefined
          ? { empreendimentoId: dto.empreendimentoId || null }
          : {}),
        ...(corretorId !== undefined ? { corretorId: corretorId || null } : {}),
        ...(dto.dataVenda !== undefined
          ? { dataVenda: this.parseDate(dto.dataVenda) }
          : {}),
        ...(dto.vgv !== undefined ? { vgv: dto.vgv } : {}),
        ...(dto.obs !== undefined ? { obs: dto.obs?.trim() || null } : {}),
      },
      select,
    });
  }

  async remove(id: string, requester: AuthenticatedUser) {
    const tenantId = await this.assertBronze(requester);
    const current = await this.prisma.cadastroVenda.findFirst({
      where: { id, tenantId },
      select: { id: true, autorId: true, corretorId: true },
    });
    if (!current) throw new NotFoundException('Venda não encontrada.');
    this.assertCanEdit(requester, current);
    await this.prisma.cadastroVenda.delete({ where: { id } });
    return { ok: true };
  }

  private parseDate(value: string) {
    const date = new Date(`${value.trim().slice(0, 10)}T12:00:00.000Z`);
    if (Number.isNaN(date.getTime())) {
      throw new ForbiddenException('Data da venda inválida.');
    }
    return date;
  }

  private async assertBronze(requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId },
      select: { plano: true },
    });
    if (!tenant || tenant.plano !== TenantPlano.bronze) {
      throw new ForbiddenException(
        'O cadastro simples de vendas é exclusivo do plano Bronze.',
      );
    }
    return tenantId;
  }

  private assertCanEdit(
    requester: AuthenticatedUser,
    row: { autorId: string; corretorId: string | null },
  ) {
    if (requester.role === Role.admin || requester.role === Role.gerente) {
      return;
    }
    if (
      isCorretorLike(requester.role) &&
      (row.autorId === requester.id || row.corretorId === requester.id)
    ) {
      return;
    }
    throw new ForbiddenException('Você não pode alterar esta venda.');
  }

  private async assertCorretor(tenantId: string, corretorId: string | null) {
    if (!corretorId) return;
    const user = await this.prisma.user.findFirst({
      where: {
        id: corretorId,
        tenantId,
        status: UserStatus.ativo,
        role: { in: [Role.corretor, Role.treinee, Role.gerente, Role.admin] },
      },
      select: { id: true },
    });
    if (!user) throw new ForbiddenException('Corretor inválido.');
  }
}
