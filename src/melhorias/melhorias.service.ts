import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MelhoriaStatus, Prisma, Role } from '@prisma/client';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { isPlatformAdmin, PLATFORM_TENANT_ID } from '../common/utils/tenant';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMelhoriaComentarioDto, CreateMelhoriaDto, UpdateMelhoriaDto } from './melhorias.dto';

const DECISAO: MelhoriaStatus[] = [MelhoriaStatus.aprovada, MelhoriaStatus.recusada];
const RECENTE_MS = 7 * 24 * 60 * 60 * 1000;

const include = {
  tenant: { select: { id: true, name: true } },
  responsavel: { select: { id: true, name: true } },
} satisfies Prisma.MelhoriaSolicitacaoInclude;

export type ComentarioBruto = {
  id: string;
  texto: string;
  interna: boolean;
  createdAt: Date;
  autor: { id: string; name: string } | null;
};

/** Super admin vê notas internas. Qualquer outro perfil só vê comentários públicos. */
export function comentariosVisiveis(role: string, comentarios: ComentarioBruto[]) {
  const lista = role === Role.super_admin ? comentarios : comentarios.filter((item) => !item.interna);
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
export class MelhoriasService {
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
    if (filtro.tenantId === PLATFORM_TENANT_ID) {
      throw new BadRequestException('O tenant interno não tem solicitações de melhoria.');
    }
    const where: Prisma.MelhoriaSolicitacaoWhereInput = {
      tenantId: filtro.tenantId ?? { not: PLATFORM_TENANT_ID },
    };
    if (filtro.status) where.status = filtro.status as MelhoriaStatus;
    if (filtro.prioridade) where.prioridade = filtro.prioridade as Prisma.MelhoriaSolicitacaoWhereInput['prioridade'];
    if (filtro.categoria) where.categoria = filtro.categoria as Prisma.MelhoriaSolicitacaoWhereInput['categoria'];
    if (filtro.responsavelId) where.responsavelId = filtro.responsavelId;
    if (filtro.q?.trim()) {
      const q = filtro.q.trim();
      where.OR = [
        { titulo: { contains: q, mode: 'insensitive' } },
        { codigo: { contains: q, mode: 'insensitive' } },
      ];
    }
    const rows = await this.prisma.melhoriaSolicitacao.findMany({
      where,
      include,
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
    return rows.map((row) => this.map(row));
  }

  async findOne(id: string, requester: AuthenticatedUser) {
    this.assertSuperAdmin(requester);
    const row = await this.load(id);
    const [comentarios, historico] = await Promise.all([
      this.prisma.melhoriaComentario.findMany({
        where: { solicitacaoId: id },
        orderBy: { createdAt: 'asc' },
        include: { autor: { select: { id: true, name: true } } },
      }),
      this.prisma.melhoriaHistorico.findMany({
        where: { solicitacaoId: id },
        orderBy: { createdAt: 'asc' },
        include: { autor: { select: { name: true } } },
      }),
    ]);
    return {
      ...this.map(row),
      comentarios: comentariosVisiveis(requester.role, comentarios),
      historico: historico.map((item) => ({
        id: item.id,
        acao: item.acao,
        detalhe: item.detalhe,
        createdAt: item.createdAt.toISOString(),
        autorNome: item.autor?.name ?? null,
      })),
    };
  }

  async create(dto: CreateMelhoriaDto, requester: AuthenticatedUser) {
    this.assertSuperAdmin(requester);
    await this.assertTenant(dto.tenantId);
    await this.assertResponsavel(dto.responsavelId);
    const codigo = await this.nextCodigo();
    const row = await this.prisma.melhoriaSolicitacao.create({
      data: {
        codigo,
        tenantId: dto.tenantId,
        titulo: dto.titulo.trim(),
        descricao: dto.descricao.trim(),
        categoria: dto.categoria,
        prioridade: dto.prioridade ?? 'normal',
        responsavelId: dto.responsavelId ?? null,
        historico: {
          create: { autorId: requester.id, acao: 'criada', detalhe: codigo },
        },
      },
      include,
    });
    return this.map(row);
  }

  async update(id: string, dto: UpdateMelhoriaDto, requester: AuthenticatedUser) {
    this.assertSuperAdmin(requester);
    const atual = await this.load(id);
    if (dto.responsavelId) await this.assertResponsavel(dto.responsavelId);
    const status = dto.status as MelhoriaStatus | undefined;
    const statusAnterior = atual.status;
    const justificativa = dto.justificativaDecisao?.trim();
    if (status && DECISAO.includes(status) && !justificativa && !atual.justificativaDecisao) {
      throw new BadRequestException('Aprovação e recusa exigem uma justificativa.');
    }
    const row = await this.prisma.melhoriaSolicitacao.update({
      where: { id },
      data: {
        ...(dto.titulo ? { titulo: dto.titulo.trim() } : {}),
        ...(dto.descricao ? { descricao: dto.descricao.trim() } : {}),
        ...(dto.categoria ? { categoria: dto.categoria } : {}),
        ...(dto.prioridade ? { prioridade: dto.prioridade } : {}),
        ...(dto.responsavelId !== undefined ? { responsavelId: dto.responsavelId } : {}),
        ...(status ? { status } : {}),
        ...(justificativa ? { justificativaDecisao: justificativa } : {}),
      },
      include,
    });
    await this.prisma.melhoriaHistorico.create({
      data: {
        solicitacaoId: id,
        autorId: requester.id,
        acao: status && status !== statusAnterior ? 'status' : 'atualizada',
        detalhe: [
          status ? `Status: ${status}` : '',
          dto.responsavelId ? `Responsável: ${dto.responsavelId}` : '',
          justificativa ? `Justificativa: ${justificativa}` : '',
        ]
          .filter(Boolean)
          .join(' · ') || 'Solicitação atualizada.',
      },
    });
    return this.map(row);
  }

  async addComentario(id: string, dto: CreateMelhoriaComentarioDto, requester: AuthenticatedUser) {
    this.assertSuperAdmin(requester);
    await this.load(id);
    await this.prisma.melhoriaComentario.create({
      data: {
        solicitacaoId: id,
        autorId: requester.id,
        texto: dto.texto.trim(),
        interna: dto.interna === true,
      },
    });
    await this.prisma.melhoriaHistorico.create({
      data: {
        solicitacaoId: id,
        autorId: requester.id,
        acao: dto.interna ? 'nota_interna' : 'comentario',
        detalhe: dto.interna ? 'Nota interna registrada.' : 'Comentário registrado.',
      },
    });
    return this.findOne(id, requester);
  }

  private async load(id: string) {
    const row = await this.prisma.melhoriaSolicitacao.findUnique({ where: { id }, include });
    if (!row || row.tenantId === PLATFORM_TENANT_ID) {
      throw new NotFoundException('Solicitação não encontrada.');
    }
    return row;
  }

  private async assertTenant(id: string) {
    if (id === PLATFORM_TENANT_ID) {
      throw new BadRequestException('O tenant interno não origina solicitação de melhoria.');
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
    const prefix = `MEL-${year}-`;
    const last = await this.prisma.melhoriaSolicitacao.findFirst({
      where: { codigo: { startsWith: prefix } },
      orderBy: { codigo: 'desc' },
      select: { codigo: true },
    });
    const seq = last ? Number(last.codigo.slice(prefix.length)) + 1 : 1;
    return `${prefix}${String(seq).padStart(4, '0')}`;
  }

  private map(row: Prisma.MelhoriaSolicitacaoGetPayload<{ include: typeof include }>) {
    const recente =
      Date.now() - row.updatedAt.getTime() <= RECENTE_MS &&
      row.updatedAt.getTime() - row.createdAt.getTime() > 60_000;
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
      justificativaDecisao: row.justificativaDecisao,
      recente,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private assertSuperAdmin(requester: AuthenticatedUser) {
    if (!isPlatformAdmin(requester)) {
      throw new ForbiddenException('A central de melhorias é exclusiva do super admin.');
    }
  }
}
