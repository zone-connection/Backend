import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role, SuportePrioridade, SuporteStatus } from '@prisma/client';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { isPlatformAdmin, PLATFORM_TENANT_ID } from '../common/utils/tenant';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateSuporteChamadoDto,
  CreateSuporteMensagemDto,
  UpdateSuporteChamadoDto,
} from './suporte.dto';

const ENCERRADOS: SuporteStatus[] = [SuporteStatus.resolvido, SuporteStatus.fechado];

const chamadoInclude = {
  tenant: { select: { id: true, name: true } },
  responsavel: { select: { id: true, name: true } },
} satisfies Prisma.SuporteChamadoInclude;

export type MensagemBruta = {
  id: string;
  texto: string;
  interna: boolean;
  createdAt: Date;
  autor: { id: string; name: string } | null;
};

/** Super admin vê notas internas. Qualquer outro perfil só vê respostas públicas. */
export function mensagensVisiveis(role: string, mensagens: MensagemBruta[]) {
  const lista = role === Role.super_admin ? mensagens : mensagens.filter((item) => !item.interna);
  return [...lista]
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((item) => ({
      id: item.id,
      texto: item.texto,
      interna: role === Role.super_admin ? item.interna : false,
      createdAt: item.createdAt.toISOString(),
      autorNome: item.autor?.name ?? null,
    }));
}

@Injectable()
export class SuporteService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    requester: AuthenticatedUser,
    filtro: {
      q?: string;
      tenantId?: string;
      status?: string;
      prioridade?: string;
      categoria?: string;
      responsavelId?: string;
    },
  ) {
    this.assertSuperAdmin(requester);
    const hoje = inicioDoDiaBrasil(new Date());
    const where: Prisma.SuporteChamadoWhereInput = {
      tenantId: filtro.tenantId ?? { not: PLATFORM_TENANT_ID },
    };
    if (filtro.status) where.status = filtro.status as SuporteStatus;
    if (filtro.prioridade) where.prioridade = filtro.prioridade as SuportePrioridade;
    if (filtro.categoria) where.categoria = filtro.categoria;
    if (filtro.responsavelId) where.responsavelId = filtro.responsavelId;
    if (filtro.q?.trim()) {
      const q = filtro.q.trim();
      where.OR = [
        { titulo: { contains: q, mode: 'insensitive' } },
        { codigo: { contains: q, mode: 'insensitive' } },
      ];
    }
    const rows = await this.prisma.suporteChamado.findMany({
      where,
      include: chamadoInclude,
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
    return rows.map((row) => this.map(row, hoje));
  }

  async findOne(id: string, requester: AuthenticatedUser) {
    this.assertSuperAdmin(requester);
    const row = await this.load(id);
    const [mensagens, historico] = await Promise.all([
      this.prisma.suporteMensagem.findMany({
        where: { chamadoId: id },
        orderBy: { createdAt: 'asc' },
        include: { autor: { select: { id: true, name: true } } },
      }),
      this.prisma.suporteHistorico.findMany({
        where: { chamadoId: id },
        orderBy: { createdAt: 'asc' },
        include: { autor: { select: { name: true } } },
      }),
    ]);
    return {
      ...this.map(row, inicioDoDiaBrasil(new Date())),
      mensagens: mensagensVisiveis(requester.role, mensagens),
      historico: historico.map((item) => ({
        id: item.id,
        acao: item.acao,
        detalhe: item.detalhe,
        createdAt: item.createdAt.toISOString(),
        autorNome: item.autor?.name ?? null,
      })),
    };
  }

  async create(dto: CreateSuporteChamadoDto, requester: AuthenticatedUser) {
    this.assertSuperAdmin(requester);
    await this.assertTenant(dto.tenantId);
    await this.assertResponsavel(dto.responsavelId);
    const codigo = await this.nextCodigo();
    const row = await this.prisma.suporteChamado.create({
      data: {
        codigo,
        tenantId: dto.tenantId,
        titulo: dto.titulo.trim(),
        descricao: dto.descricao.trim(),
        categoria: dto.categoria.trim(),
        prioridade: dto.prioridade ?? 'normal',
        responsavelId: dto.responsavelId ?? null,
        prazoEm: dto.prazoEm ? parseDia(dto.prazoEm) : null,
        historico: {
          create: { autorId: requester.id, acao: 'criado', detalhe: codigo },
        },
      },
      include: chamadoInclude,
    });
    return this.map(row, inicioDoDiaBrasil(new Date()));
  }

  async update(id: string, dto: UpdateSuporteChamadoDto, requester: AuthenticatedUser) {
    this.assertSuperAdmin(requester);
    const atual = await this.load(id);
    if (dto.responsavelId) await this.assertResponsavel(dto.responsavelId);
    const status = dto.status as SuporteStatus | undefined;
    const reabertura =
      status &&
      ENCERRADOS.includes(atual.status) &&
      !ENCERRADOS.includes(status);
    const row = await this.prisma.suporteChamado.update({
      where: { id },
      data: {
        ...(dto.titulo ? { titulo: dto.titulo.trim() } : {}),
        ...(dto.categoria ? { categoria: dto.categoria.trim() } : {}),
        ...(dto.prioridade ? { prioridade: dto.prioridade } : {}),
        ...(dto.responsavelId !== undefined ? { responsavelId: dto.responsavelId } : {}),
        ...(dto.prazoEm !== undefined
          ? { prazoEm: dto.prazoEm ? parseDia(dto.prazoEm) : null }
          : {}),
        ...(status ? { status } : {}),
        ...(status === SuporteStatus.resolvido ? { resolvidoEm: new Date() } : {}),
        ...(status === SuporteStatus.fechado ? { fechadoEm: new Date() } : {}),
        ...(reabertura ? { resolvidoEm: null, fechadoEm: null } : {}),
      },
      include: chamadoInclude,
    });
    await this.prisma.suporteHistorico.create({
      data: {
        chamadoId: id,
        autorId: requester.id,
        acao: reabertura ? 'reaberto' : 'atualizado',
        detalhe: [
          status ? `Status: ${status}` : '',
          dto.responsavelId ? `Responsável: ${dto.responsavelId}` : '',
        ]
          .filter(Boolean)
          .join(' · ') || 'Chamado atualizado.',
      },
    });
    return this.map(row, inicioDoDiaBrasil(new Date()));
  }

  async addMensagem(id: string, dto: CreateSuporteMensagemDto, requester: AuthenticatedUser) {
    this.assertSuperAdmin(requester);
    await this.load(id);
    await this.prisma.suporteMensagem.create({
      data: {
        chamadoId: id,
        autorId: requester.id,
        texto: dto.texto.trim(),
        interna: dto.interna === true,
      },
    });
    await this.prisma.suporteHistorico.create({
      data: {
        chamadoId: id,
        autorId: requester.id,
        acao: dto.interna ? 'nota_interna' : 'resposta',
        detalhe: dto.interna ? 'Nota interna registrada.' : 'Resposta registrada.',
      },
    });
    return this.findOne(id, requester);
  }

  private async load(id: string) {
    const row = await this.prisma.suporteChamado.findUnique({
      where: { id },
      include: chamadoInclude,
    });
    if (!row || row.tenantId === PLATFORM_TENANT_ID) {
      throw new NotFoundException('Chamado não encontrado.');
    }
    return row;
  }

  private async assertTenant(id: string) {
    if (id === PLATFORM_TENANT_ID) {
      throw new BadRequestException('O tenant interno não recebe chamado de suporte.');
    }
    const tenant = await this.prisma.tenant.findUnique({ where: { id }, select: { id: true } });
    if (!tenant) throw new NotFoundException('Imobiliária não encontrada.');
  }

  private async assertResponsavel(id?: string | null) {
    if (!id) return;
    const user = await this.prisma.user.findUnique({ where: { id }, select: { role: true } });
    if (!user || user.role !== Role.super_admin) {
      throw new BadRequestException('O responsável precisa ser um usuário do super admin.');
    }
  }

  private async nextCodigo() {
    const year = new Date().getFullYear();
    const prefix = `SUP-${year}-`;
    const last = await this.prisma.suporteChamado.findFirst({
      where: { codigo: { startsWith: prefix } },
      orderBy: { codigo: 'desc' },
      select: { codigo: true },
    });
    const seq = last ? Number(last.codigo.slice(prefix.length)) + 1 : 1;
    return `${prefix}${String(seq).padStart(4, '0')}`;
  }

  private map(
    row: Prisma.SuporteChamadoGetPayload<{ include: typeof chamadoInclude }>,
    hoje: Date,
  ) {
    const atrasado =
      !!row.prazoEm &&
      !ENCERRADOS.includes(row.status) &&
      row.prazoEm.getTime() < hoje.getTime();
    return {
      id: row.id,
      codigo: row.codigo,
      tenantId: row.tenantId,
      tenantNome: row.tenant.name,
      titulo: row.titulo,
      descricao: row.descricao,
      categoria: row.categoria,
      prioridade: row.prioridade,
      status: row.status,
      responsavelId: row.responsavelId,
      responsavelNome: row.responsavel?.name ?? null,
      prazoEm: row.prazoEm?.toISOString() ?? null,
      resolvidoEm: row.resolvidoEm?.toISOString() ?? null,
      fechadoEm: row.fechadoEm?.toISOString() ?? null,
      atrasado,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private assertSuperAdmin(requester: AuthenticatedUser) {
    if (!isPlatformAdmin(requester)) {
      throw new ForbiddenException('A central de suporte é exclusiva do super admin.');
    }
  }
}

function parseDia(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 3, 0, 0));
}

function inicioDoDiaBrasil(agora: Date) {
  const brasil = new Date(agora.getTime() - 3 * 60 * 60 * 1000);
  return new Date(Date.UTC(brasil.getUTCFullYear(), brasil.getUTCMonth(), brasil.getUTCDate(), 3, 0, 0));
}
