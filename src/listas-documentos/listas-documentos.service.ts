import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { PrismaService } from '../prisma/prisma.service';
import {
  LISTAS_DOCUMENTO_PADRAO,
  LISTA_DOCUMENTO_AVISO,
  LISTA_DOCUMENTO_INTRO,
} from './lista-documento.defaults';
import {
  CreateListaDocumentoDto,
  ListaDocumentoItemInput,
  UpdateListaDocumentoDto,
} from './dto/lista-documento.dto';

const listaInclude = {
  itens: { orderBy: { sortOrder: 'asc' as const } },
} satisfies Prisma.ListaDocumentoInclude;

@Injectable()
export class ListasDocumentosService {
  constructor(private readonly prisma: PrismaService) {}

  private tenantId(user: AuthenticatedUser) {
    if (!user.tenantId) throw new ForbiddenException('Tenant obrigatório.');
    return user.tenantId;
  }

  private assertGestor(user: AuthenticatedUser) {
    if (
      user.role !== Role.admin &&
      user.role !== Role.gerente &&
      user.role !== Role.super_admin
    ) {
      throw new ForbiddenException('Apenas admin e gerente podem alterar as listas.');
    }
  }

  async list(user: AuthenticatedUser) {
    const tenantId = this.tenantId(user);
    await this.ensureDefaults(tenantId);
    return this.prisma.listaDocumento.findMany({
      where: { tenantId },
      include: listaInclude,
      orderBy: [{ sortOrder: 'asc' }, { nome: 'asc' }],
    });
  }

  async create(dto: CreateListaDocumentoDto, user: AuthenticatedUser) {
    this.assertGestor(user);
    const tenantId = this.tenantId(user);
    const itens = this.cleanItens(dto.itens ?? []);
    const ultimo = await this.prisma.listaDocumento.aggregate({
      where: { tenantId },
      _max: { sortOrder: true },
    });
    return this.prisma.listaDocumento.create({
      data: {
        tenantId,
        nome: dto.nome.trim(),
        intro: dto.intro?.trim() || LISTA_DOCUMENTO_INTRO,
        aviso: dto.aviso?.trim() || LISTA_DOCUMENTO_AVISO,
        sortOrder: (ultimo._max.sortOrder ?? -1) + 1,
        itens: {
          create: itens.map((item, index) => ({
            titulo: item.titulo,
            descricao: item.descricao,
            sortOrder: index,
          })),
        },
      },
      include: listaInclude,
    });
  }

  async update(id: string, dto: UpdateListaDocumentoDto, user: AuthenticatedUser) {
    this.assertGestor(user);
    const tenantId = this.tenantId(user);
    const atual = await this.prisma.listaDocumento.findFirst({
      where: { id, tenantId },
      include: { itens: true },
    });
    if (!atual) throw new NotFoundException('Lista não encontrada.');

    return this.prisma.$transaction(async (tx) => {
      if (dto.itens) {
        const itens = this.cleanItens(dto.itens);
        const keep = new Set(itens.map((item) => item.id).filter((id): id is string => Boolean(id)));
        await tx.listaDocumentoItem.deleteMany({
          where:
            keep.size === 0
              ? { listaId: id }
              : { listaId: id, id: { notIn: [...keep] } },
        });
        for (const [index, item] of itens.entries()) {
          if (item.id && atual.itens.some((row) => row.id === item.id)) {
            await tx.listaDocumentoItem.update({
              where: { id: item.id },
              data: {
                titulo: item.titulo,
                descricao: item.descricao,
                sortOrder: index,
              },
            });
          } else {
            await tx.listaDocumentoItem.create({
              data: {
                listaId: id,
                titulo: item.titulo,
                descricao: item.descricao,
                sortOrder: index,
              },
            });
          }
        }
      }
      return tx.listaDocumento.update({
        where: { id },
        data: {
          nome: dto.nome?.trim(),
          intro: dto.intro?.trim(),
          aviso: dto.aviso?.trim(),
        },
        include: listaInclude,
      });
    });
  }

  async remove(id: string, user: AuthenticatedUser) {
    this.assertGestor(user);
    const tenantId = this.tenantId(user);
    const atual = await this.prisma.listaDocumento.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!atual) throw new NotFoundException('Lista não encontrada.');
    await this.prisma.listaDocumento.delete({ where: { id } });
    return { ok: true as const };
  }

  private cleanItens(itens: ListaDocumentoItemInput[]) {
    const cleaned = itens
      .map((item) => ({
        id: item.id?.trim() || undefined,
        titulo: item.titulo.trim(),
        descricao: item.descricao?.trim() ?? '',
      }))
      .filter((item) => item.titulo.length > 0);
    if (cleaned.length === 0) {
      throw new BadRequestException('A lista precisa de ao menos um documento.');
    }
    return cleaned;
  }

  private async ensureDefaults(tenantId: string) {
    const count = await this.prisma.listaDocumento.count({ where: { tenantId } });
    if (count > 0) return;
    try {
      await this.prisma.$transaction(
        LISTAS_DOCUMENTO_PADRAO.map((lista) =>
          this.prisma.listaDocumento.create({
            data: {
              tenantId,
              chave: lista.chave,
              nome: lista.nome,
              intro: LISTA_DOCUMENTO_INTRO,
              aviso: LISTA_DOCUMENTO_AVISO,
              sortOrder: lista.sortOrder,
              itens: {
                create: lista.itens.map((item, index) => ({
                  titulo: item.titulo,
                  descricao: item.descricao,
                  sortOrder: index,
                })),
              },
            },
          }),
        ),
      );
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        return;
      }
      throw err;
    }
  }
}
