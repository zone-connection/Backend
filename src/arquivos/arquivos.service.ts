import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ArquivoCategoria,
  ArquivoEventoTipo,
  ArquivoVinculoTipo,
  Prisma,
  Role,
} from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { PassThrough } from 'node:stream';
import { PrismaService } from '../prisma/prisma.service';
import { MailerService } from '../mailer/mailer.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { requireTenantId } from '../common/utils/tenant';
import { isCorretorLike } from '../common/utils/roles';
import { R2Service } from './r2.service';
import {
  ANEXO_EMAIL_MAX_BYTES,
  ARQUIVO_MAX_BYTES,
  ARQUIVO_MAX_POR_REGISTRO,
  TAGS_PADRAO,
  ZIP_EMAIL_MAX_BYTES,
  detectDocumentoKind,
  extFromMime,
  sanitizeFilename,
  slugifyTag,
} from './arquivos.constants';

import { ZipArchive } from 'archiver';

const arquivoInclude = {
  tags: { include: { tag: true } },
  uploadedBy: { select: { id: true, name: true } },
  vinculos: true,
} as const;

@Injectable()
export class ArquivosService {
  private readonly logger = new Logger(ArquivosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly r2: R2Service,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
  ) {}

  canManageTags(user: AuthenticatedUser) {
    const role = String(user.role);
    return (
      role === Role.admin ||
      role === Role.gerente ||
      role === Role.super_admin
    );
  }

  canBulk(user: AuthenticatedUser) {
    return this.canManageTags(user);
  }

  private async log(params: {
    tenantId: string;
    userId?: string | null;
    arquivoId?: string | null;
    tipo: ArquivoEventoTipo;
    detalhe?: Record<string, unknown>;
  }) {
    await this.prisma.arquivoEvento.create({
      data: {
        tenantId: params.tenantId,
        userId: params.userId ?? null,
        arquivoId: params.arquivoId ?? null,
        tipo: params.tipo,
        detalhe: (params.detalhe ?? undefined) as
          | Prisma.InputJsonValue
          | undefined,
      },
    });
  }

  async assertEntityAccess(
    user: AuthenticatedUser,
    entityType: ArquivoVinculoTipo,
    entityId: string,
  ) {
    const tenantId = requireTenantId(user);
    const found = await this.findEntity(tenantId, entityType, entityId);
    if (!found) {
      throw new NotFoundException('Registro não encontrado.');
    }
    if (entityType === ArquivoVinculoTipo.lead && isCorretorLike(user.role)) {
      const lead = found as { corretorId: string | null };
      if (lead.corretorId && lead.corretorId !== user.id) {
        throw new ForbiddenException('Sem acesso a este registro.');
      }
    }
    return { tenantId, label: this.entityLabel(entityType, found) };
  }

  private entityLabel(
    type: ArquivoVinculoTipo,
    row: Record<string, unknown>,
  ): string {
    const nome =
      (row.nome as string) ||
      (row.titulo as string) ||
      (row.descricao as string) ||
      (row.cliente as string) ||
      (row.codigo as string) ||
      (row.logradouro as string) ||
      (row.cidade as string) ||
      '';
    return nome || type;
  }

  private async findEntity(
    tenantId: string,
    entityType: ArquivoVinculoTipo,
    entityId: string,
  ): Promise<Record<string, unknown> | null> {
    switch (entityType) {
      case ArquivoVinculoTipo.lead:
        return this.prisma.lead.findFirst({
          where: { id: entityId, tenantId },
          select: { id: true, nome: true, corretorId: true },
        });
      case ArquivoVinculoTipo.imovel:
        return this.prisma.imovel.findFirst({
          where: { id: entityId, tenantId },
          select: { id: true, logradouro: true, cidade: true },
        });
      case ArquivoVinculoTipo.empreendimento:
        return this.prisma.empreendimento.findFirst({
          where: { id: entityId, tenantId },
          select: { id: true, nome: true },
        });
      case ArquivoVinculoTipo.proprietario:
        return this.prisma.proprietario.findFirst({
          where: { id: entityId, tenantId },
          select: { id: true, nome: true },
        });
      case ArquivoVinculoTipo.venda_usado:
        return this.prisma.vendaUsado.findFirst({
          where: { id: entityId, tenantId },
          select: { id: true },
        });
      case ArquivoVinculoTipo.documentacao:
        return this.prisma.documentacao.findFirst({
          where: { id: entityId, tenantId },
          select: { id: true, nome: true },
        });
      case ArquivoVinculoTipo.tarefa:
        return this.prisma.tarefa.findFirst({
          where: { id: entityId, tenantId },
          select: { id: true, titulo: true, leadId: true },
        });
      case ArquivoVinculoTipo.proposta:
        return this.prisma.proposta.findFirst({
          where: { id: entityId, tenantId },
          select: { id: true, codigo: true },
        });
      case ArquivoVinculoTipo.processo:
        return this.prisma.processo.findFirst({
          where: { id: entityId, tenantId },
          select: { id: true, nome: true },
        });
      case ArquivoVinculoTipo.financeiro_titulo:
        return this.prisma.financeiroTitulo.findFirst({
          where: { id: entityId, tenantId },
          select: { id: true, descricao: true },
        });
      case ArquivoVinculoTipo.financeiro_comissao:
        return this.prisma.financeiroComissao.findFirst({
          where: { id: entityId, tenantId },
          select: { id: true, cliente: true },
        });
      default:
        return null;
    }
  }

  async listTags(user: AuthenticatedUser, q?: string, includeInactive = false) {
    const tenantId = requireTenantId(user);
    await this.ensureDefaultTags(tenantId, user.id);
    return this.prisma.documentoTag.findMany({
      where: {
        tenantId,
        ...(includeInactive ? {} : { active: true }),
        ...(q?.trim()
          ? { nome: { contains: q.trim(), mode: 'insensitive' } }
          : {}),
      },
      orderBy: { nome: 'asc' },
      include: { _count: { select: { arquivos: true } } },
    });
  }

  private async ensureDefaultTags(tenantId: string, userId: string) {
    const count = await this.prisma.documentoTag.count({ where: { tenantId } });
    if (count > 0) return;
    await this.prisma.documentoTag.createMany({
      data: TAGS_PADRAO.map((nome) => ({
        tenantId,
        nome,
        slug: slugifyTag(nome),
        createdById: userId,
      })),
      skipDuplicates: true,
    });
  }

  async createTag(user: AuthenticatedUser, nome: string) {
    if (!this.canManageTags(user)) {
      throw new ForbiddenException('Sem permissão para criar tags.');
    }
    const tenantId = requireTenantId(user);
    const trimmed = nome.trim();
    const slug = slugifyTag(trimmed);
    if (!slug) {
      throw new BadRequestException('Informe um nome válido para a tag.');
    }
    const exists = await this.prisma.documentoTag.findFirst({
      where: { tenantId, slug },
    });
    if (exists) {
      throw new BadRequestException('Já existe uma tag com esse nome.');
    }
    const tag = await this.prisma.documentoTag.create({
      data: {
        tenantId,
        nome: trimmed,
        slug,
        createdById: user.id,
      },
    });
    await this.log({
      tenantId,
      userId: user.id,
      tipo: ArquivoEventoTipo.tag_criar,
      detalhe: { tagId: tag.id, nome: tag.nome },
    });
    return tag;
  }

  async updateTag(
    user: AuthenticatedUser,
    id: string,
    data: { nome?: string; active?: boolean },
  ) {
    if (!this.canManageTags(user)) {
      throw new ForbiddenException('Sem permissão para gerenciar tags.');
    }
    const tenantId = requireTenantId(user);
    const tag = await this.prisma.documentoTag.findFirst({
      where: { id, tenantId },
    });
    if (!tag) throw new NotFoundException('Tag não encontrada.');
    const nextNome = data.nome?.trim();
    const nextSlug = nextNome ? slugifyTag(nextNome) : undefined;
    if (nextSlug && nextSlug !== tag.slug) {
      const dup = await this.prisma.documentoTag.findFirst({
        where: { tenantId, slug: nextSlug, NOT: { id } },
      });
      if (dup) {
        throw new BadRequestException('Já existe uma tag com esse nome.');
      }
    }
    const updated = await this.prisma.documentoTag.update({
      where: { id },
      data: {
        ...(nextNome ? { nome: nextNome, slug: nextSlug } : {}),
        ...(data.active !== undefined ? { active: data.active } : {}),
      },
    });
    if (nextNome && nextNome !== tag.nome) {
      await this.log({
        tenantId,
        userId: user.id,
        tipo: ArquivoEventoTipo.tag_renomear,
        detalhe: { tagId: id, de: tag.nome, para: nextNome },
      });
    }
    if (data.active === false && tag.active) {
      await this.log({
        tenantId,
        userId: user.id,
        tipo: ArquivoEventoTipo.tag_inativar,
        detalhe: { tagId: id },
      });
    }
    if (data.active === true && !tag.active) {
      await this.log({
        tenantId,
        userId: user.id,
        tipo: ArquivoEventoTipo.tag_ativar,
        detalhe: { tagId: id },
      });
    }
    return updated;
  }

  serialize(row: {
    id: string;
    nomeExibicao: string;
    nomeOriginal: string;
    categoria: ArquivoCategoria;
    mime?: string;
    bytes: number;
    createdAt: Date;
    deletedAt: Date | null;
    uploadedBy: { id: string; name: string } | null;
    tags: { tag: { id: string; nome: string; active: boolean } }[];
    vinculos: { entityType: ArquivoVinculoTipo; entityId: string; origem: string }[];
  }) {
    return {
      id: row.id,
      nome: row.nomeExibicao,
      nomeOriginal: row.nomeOriginal,
      categoria: row.categoria,
      mime: row.mime || 'application/pdf',
      bytes: row.bytes,
      createdAt: row.createdAt.toISOString(),
      uploadedBy: row.uploadedBy,
      tags: row.tags.map((t) => ({
        id: t.tag.id,
        nome: t.tag.nome,
        active: t.tag.active,
      })),
      vinculos: row.vinculos,
    };
  }

  async list(
    user: AuthenticatedUser,
    entityType: ArquivoVinculoTipo,
    entityId: string,
    categoria?: ArquivoCategoria,
  ) {
    const { tenantId } = await this.assertEntityAccess(user, entityType, entityId);
    const rows = await this.prisma.arquivoDocumento.findMany({
      where: {
        tenantId,
        deletedAt: null,
        ...(categoria ? { categoria } : {}),
        vinculos: { some: { entityType, entityId } },
      },
      include: arquivoInclude,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => this.serialize(row));
  }

  async listHistorico(
    user: AuthenticatedUser,
    entityType: ArquivoVinculoTipo,
    entityId: string,
  ) {
    const { tenantId } = await this.assertEntityAccess(user, entityType, entityId);
    const tipos = [
      ArquivoEventoTipo.upload,
      ArquivoEventoTipo.download,
      ArquivoEventoTipo.visualizar,
      ArquivoEventoTipo.excluir,
      ArquivoEventoTipo.download_zip,
      ArquivoEventoTipo.compartilhar_email,
    ];
    const rows = await this.prisma.arquivoEvento.findMany({
      where: {
        tenantId,
        tipo: { in: tipos },
        OR: [
          { arquivo: { vinculos: { some: { entityType, entityId } } } },
          { detalhe: { path: ['entityId'], equals: entityId } },
        ],
      },
      include: {
        user: { select: { id: true, name: true } },
        arquivo: { select: { nomeExibicao: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 80,
    });
    return rows.map((row) => {
      const detalhe =
        row.detalhe && typeof row.detalhe === 'object' && !Array.isArray(row.detalhe)
          ? (row.detalhe as Record<string, unknown>)
          : null;
      const nomes = Array.isArray(detalhe?.nomes)
        ? detalhe.nomes.filter((n): n is string => typeof n === 'string')
        : [];
      return {
        id: row.id,
        tipo: row.tipo,
        createdAt: row.createdAt.toISOString(),
        autor: row.user,
        arquivo: row.arquivo?.nomeExibicao ?? (typeof detalhe?.nome === 'string' ? detalhe.nome : null),
        email: typeof detalhe?.email === 'string' ? detalhe.email : null,
        count: typeof detalhe?.count === 'number' ? detalhe.count : nomes.length || null,
        nomes,
        resultado: typeof detalhe?.resultado === 'string' ? detalhe.resultado : null,
      };
    });
  }

  async upload(params: {
    user: AuthenticatedUser;
    file: Express.Multer.File;
    entityType: ArquivoVinculoTipo;
    entityId: string;
    nomeExibicao: string;
    categoria: ArquivoCategoria;
    tagIds: string[];
    extraVinculos?: { entityType: ArquivoVinculoTipo; entityId: string }[];
  }) {
    const { user, file } = params;
    const { tenantId } = await this.assertEntityAccess(
      user,
      params.entityType,
      params.entityId,
    );
    if (!file?.buffer) {
      throw new BadRequestException('Envie um PDF ou imagem.');
    }
    if (file.buffer.length > ARQUIVO_MAX_BYTES) {
      throw new BadRequestException('O arquivo deve ter no máximo 5 MB.');
    }
    const kind = detectDocumentoKind(
      file.buffer,
      file.originalname,
      file.mimetype,
    );
    if (!kind) {
      throw new BadRequestException(
        'Envie um PDF ou imagem (JPG, PNG, WEBP ou GIF).',
      );
    }
    const tagIds = [...new Set(params.tagIds.filter(Boolean))];
    if (
      tagIds.length === 0 &&
      params.entityType !== ArquivoVinculoTipo.processo &&
      params.entityType !== ArquivoVinculoTipo.financeiro_titulo &&
      params.entityType !== ArquivoVinculoTipo.financeiro_comissao
    ) {
      throw new BadRequestException('Selecione pelo menos uma tag.');
    }
    const tags =
      tagIds.length === 0
        ? []
        : await this.prisma.documentoTag.findMany({
            where: { tenantId, id: { in: tagIds }, active: true },
          });
    if (tags.length !== tagIds.length) {
      throw new BadRequestException('Uma ou mais tags são inválidas.');
    }
    const count = await this.prisma.arquivoVinculo.count({
      where: {
        tenantId,
        entityType: params.entityType,
        entityId: params.entityId,
        arquivo: { deletedAt: null },
      },
    });
    if (count >= ARQUIVO_MAX_POR_REGISTRO) {
      throw new BadRequestException(
        `Limite de ${ARQUIVO_MAX_POR_REGISTRO} documentos neste registro.`,
      );
    }
    const id = randomBytes(16).toString('hex');
    const storageKey = `${tenantId}/${params.entityType}/${id}.${kind.ext}`;
    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    try {
      await this.r2.putObject(storageKey, file.buffer, kind.mime);
    } catch (error) {
      this.logger.error(
        `Falha no R2 ao enviar PDF: ${error instanceof Error ? error.message : error}`,
      );
      const detail = error instanceof Error ? error.message : String(error);
      if (/access key has length/i.test(detail) || /R2_ACCESS_KEY_ID/i.test(detail)) {
        throw new ServiceUnavailableException(
          'O armazenamento de PDFs está com a chave R2 inválida. No Dokploy, confira R2_ACCESS_KEY_ID (deve ter 32 caracteres).',
        );
      }
      throw new ServiceUnavailableException(
        'Não foi possível gravar o PDF no armazenamento. Tente novamente.',
      );
    }
    const extra = params.extraVinculos ?? [];
    for (const extraV of extra) {
      await this.assertEntityAccess(user, extraV.entityType, extraV.entityId);
    }
    const vinculos = [
      {
        tenantId,
        entityType: params.entityType,
        entityId: params.entityId,
        origem: 'cadastro',
      },
      ...extra.map((v) => ({
        tenantId,
        entityType: v.entityType,
        entityId: v.entityId,
        origem: 'relacionado',
      })),
    ];
    let created;
    try {
      created = await this.prisma.arquivoDocumento.create({
        data: {
          tenantId,
          storageKey,
          sha256,
          mime: kind.mime,
          bytes: file.buffer.length,
          nomeExibicao: params.nomeExibicao.trim() || file.originalname,
          nomeOriginal: file.originalname,
          categoria: params.categoria,
          uploadedById: user.id,
          tags: { create: tagIds.map((tagId) => ({ tagId })) },
          vinculos: { create: vinculos },
        },
        include: arquivoInclude,
      });
    } catch (error) {
      await this.r2.deleteObject(storageKey);
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Falha ao salvar PDF no banco: ${message}`);
      if (
        /invalid input value for enum/i.test(message) ||
        /ArquivoVinculoTipo/i.test(message)
      ) {
        throw new BadRequestException(
          'O banco ainda não aceita documento vinculado a processo. Aplique a migration mais recente.',
        );
      }
      throw new BadRequestException('Não foi possível salvar o documento.');
    }
    await this.log({
      tenantId,
      userId: user.id,
      arquivoId: created.id,
      tipo: ArquivoEventoTipo.upload,
      detalhe: {
        entityType: params.entityType,
        entityId: params.entityId,
        tags: tags.map((t) => t.nome),
      },
    });
    return this.serialize(created);
  }

  private async loadOwned(
    user: AuthenticatedUser,
    id: string,
    entityType?: ArquivoVinculoTipo,
    entityId?: string,
  ) {
    const tenantId = requireTenantId(user);
    const row = await this.prisma.arquivoDocumento.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: arquivoInclude,
    });
    if (!row) throw new NotFoundException('Documento não encontrado.');
    if (entityType && entityId) {
      const ok = row.vinculos.some(
        (v) => v.entityType === entityType && v.entityId === entityId,
      );
      if (!ok) throw new NotFoundException('Documento não encontrado.');
      await this.assertEntityAccess(user, entityType, entityId);
    } else {
      for (const v of row.vinculos) {
        try {
          await this.assertEntityAccess(user, v.entityType, v.entityId);
          return { tenantId, row };
        } catch {
          continue;
        }
      }
      throw new ForbiddenException('Sem acesso a este documento.');
    }
    return { tenantId, row };
  }

  async update(
    user: AuthenticatedUser,
    id: string,
    dto: { nomeExibicao?: string; tagIds?: string[] },
  ) {
    const { tenantId, row } = await this.loadOwned(user, id);
    const data: { nomeExibicao?: string } = {};
    if (dto.nomeExibicao?.trim()) data.nomeExibicao = dto.nomeExibicao.trim();
    if (dto.tagIds) {
      const tagIds = [...new Set(dto.tagIds)];
      if (tagIds.length === 0) {
        throw new BadRequestException('Selecione pelo menos uma tag.');
      }
      const tags = await this.prisma.documentoTag.findMany({
        where: { tenantId, id: { in: tagIds } },
      });
      if (tags.length !== tagIds.length) {
        throw new BadRequestException('Uma ou mais tags são inválidas.');
      }
      const before = row.tags.map((t) => t.tag.nome);
      await this.prisma.arquivoDocumentoTag.deleteMany({
        where: { arquivoId: id },
      });
      await this.prisma.arquivoDocumentoTag.createMany({
        data: tagIds.map((tagId) => ({ arquivoId: id, tagId })),
      });
      await this.log({
        tenantId,
        userId: user.id,
        arquivoId: id,
        tipo: ArquivoEventoTipo.tags_alteradas,
        detalhe: { de: before, para: tags.map((t) => t.nome) },
      });
    }
    if (data.nomeExibicao && data.nomeExibicao !== row.nomeExibicao) {
      await this.prisma.arquivoDocumento.update({ where: { id }, data });
      await this.log({
        tenantId,
        userId: user.id,
        arquivoId: id,
        tipo: ArquivoEventoTipo.alterar_metadados,
        detalhe: { nome: data.nomeExibicao },
      });
    }
    const next = await this.prisma.arquivoDocumento.findFirstOrThrow({
      where: { id },
      include: arquivoInclude,
    });
    return this.serialize(next);
  }

  async remove(
    user: AuthenticatedUser,
    id: string,
    entityType: ArquivoVinculoTipo,
    entityId: string,
  ) {
    const { tenantId, row } = await this.loadOwned(
      user,
      id,
      entityType,
      entityId,
    );
    await this.prisma.arquivoVinculo.deleteMany({
      where: { arquivoId: id, entityType, entityId, tenantId },
    });
    const restantes = await this.prisma.arquivoVinculo.count({
      where: { arquivoId: id },
    });
    if (restantes === 0) {
      await this.prisma.arquivoDocumento.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
      await this.r2.deleteObject(row.storageKey);
    }
    await this.log({
      tenantId,
      userId: user.id,
      arquivoId: id,
      tipo: ArquivoEventoTipo.excluir,
      detalhe: { entityType, entityId },
    });
    return { ok: true };
  }

  async download(user: AuthenticatedUser, id: string) {
    const { tenantId, row } = await this.loadOwned(user, id);
    const buffer = await this.r2.getObjectBuffer(row.storageKey);
    await this.log({
      tenantId,
      userId: user.id,
      arquivoId: id,
      tipo: ArquivoEventoTipo.download,
      detalhe: { nome: row.nomeExibicao },
    });
    const ext = extFromMime(row.mime, row.nomeOriginal);
    return {
      buffer,
      mime: row.mime || 'application/pdf',
      filename: sanitizeFilename(row.nomeExibicao, ext),
    };
  }

  async previewUrl(user: AuthenticatedUser, id: string) {
    const { tenantId, row } = await this.loadOwned(user, id);
    const url = await this.r2.signedGetUrl(
      row.storageKey,
      sanitizeFilename(row.nomeExibicao),
    );
    await this.log({
      tenantId,
      userId: user.id,
      arquivoId: id,
      tipo: ArquivoEventoTipo.visualizar,
      detalhe: { nome: row.nomeExibicao },
    });
    return { url };
  }

  private async collectForEntity(
    user: AuthenticatedUser,
    entityType: ArquivoVinculoTipo,
    entityId: string,
    ids?: string[],
  ) {
    const { tenantId, label } = await this.assertEntityAccess(
      user,
      entityType,
      entityId,
    );
    const rows = await this.prisma.arquivoDocumento.findMany({
      where: {
        tenantId,
        deletedAt: null,
        vinculos: { some: { entityType, entityId } },
        ...(ids?.length ? { id: { in: ids } } : {}),
      },
      include: arquivoInclude,
    });
    const unique = new Map(rows.map((r) => [r.id, r]));
    return { tenantId, label, rows: [...unique.values()] };
  }

  async zipStream(
    user: AuthenticatedUser,
    entityType: ArquivoVinculoTipo,
    entityId: string,
    ids?: string[],
  ) {
    if (!this.canBulk(user)) {
      throw new ForbiddenException(
        'Apenas administradores e gerentes podem baixar todos os documentos.',
      );
    }
    const { tenantId, label, rows } = await this.collectForEntity(
      user,
      entityType,
      entityId,
      ids,
    );
    if (rows.length === 0) {
      throw new BadRequestException('Nenhum documento para baixar.');
    }
    const pass = new PassThrough();
    const archive = new ZipArchive({ zlib: { level: 9 } });
    archive.on('error', (err: Error) => pass.destroy(err));
    archive.pipe(pass);
    const used = new Set<string>();
    for (const row of rows) {
      const buffer = await this.r2.getObjectBuffer(row.storageKey);
      let name = sanitizeFilename(row.nomeExibicao);
      if (used.has(name.toLowerCase())) {
        name = sanitizeFilename(`${row.nomeExibicao}-${row.id.slice(0, 6)}`);
      }
      used.add(name.toLowerCase());
      archive.append(buffer, { name });
    }
    void archive.finalize();
    await this.log({
      tenantId,
      userId: user.id,
      tipo: ArquivoEventoTipo.download_zip,
      detalhe: {
        entityType,
        entityId,
        count: rows.length,
        nomes: rows.map((r) => r.nomeExibicao),
      },
    });
    const zipName = `Documentos_${label.replace(/\s+/g, '_')}.zip`;
    return { stream: pass, filename: sanitizeFilename(zipName).replace(/\.pdf$/i, '.zip') };
  }

  async shareEmail(
    user: AuthenticatedUser,
    dto: {
      entityType: ArquivoVinculoTipo;
      entityId: string;
      email: string;
      ids?: string[];
      all?: boolean;
    },
  ) {
    if (!this.canBulk(user)) {
      throw new ForbiddenException(
        'Apenas administradores e gerentes podem compartilhar documentos.',
      );
    }
    if (!this.mailer.isConfigured()) {
      throw new ServiceUnavailableException('Serviço de e-mail não configurado.');
    }
    const { tenantId, label, rows } = await this.collectForEntity(
      user,
      dto.entityType,
      dto.entityId,
      dto.all ? undefined : dto.ids,
    );
    if (rows.length === 0) {
      throw new BadRequestException('Nenhum documento selecionado.');
    }
    const files: { filename: string; content: Buffer }[] = [];
    let total = 0;
    for (const row of rows) {
      const content = await this.r2.getObjectBuffer(row.storageKey);
      total += content.length;
      files.push({ filename: sanitizeFilename(row.nomeExibicao), content });
    }
    let method: 'anexos' | 'zip' | 'link' = 'anexos';
    const publicBase =
      this.config.get<string>('CRM_PUBLIC_URL')?.trim() ||
      this.config.get<string>('FRONTEND_URL')?.split(',')[0]?.trim() ||
      '';
    try {
      if (total <= ANEXO_EMAIL_MAX_BYTES && files.length <= 8) {
        await this.mailer.sendText({
          to: dto.email,
          subject: `Documentos — ${label}`,
          text: `Seguem os documentos de ${label} enviados pelo Zone Connection.`,
          attachments: files.map((f) => ({
            filename: f.filename,
            content: f.content,
            contentType: 'application/pdf',
          })),
        });
      } else if (total <= ZIP_EMAIL_MAX_BYTES) {
        method = 'zip';
        const zipBuf = await this.buildZipBuffer(files);
        await this.mailer.sendText({
          to: dto.email,
          subject: `Documentos — ${label}`,
          text: `Segue um arquivo ZIP com os documentos de ${label}.`,
          attachments: [
            {
              filename: `Documentos_${label.replace(/\s+/g, '_')}.zip`,
              content: zipBuf,
              contentType: 'application/zip',
            },
          ],
        });
      } else {
        method = 'link';
        const hours = Number(
          this.config.get<string>('SHARE_LINK_TTL_HOURS') ?? 24,
        );
        const raw = randomBytes(32).toString('hex');
        const tokenHash = createHash('sha256').update(raw).digest('hex');
        await this.prisma.arquivoShareLink.create({
          data: {
            tenantId,
            tokenHash,
            createdById: user.id,
            emailTo: dto.email,
            expiresAt: new Date(Date.now() + hours * 3600_000),
            itens: {
              create: rows.map((r) => ({ arquivoId: r.id })),
            },
          },
        });
        const url = `${publicBase.replace(/\/$/, '')}/api/arquivos/share/${raw}`;
        await this.mailer.sendText({
          to: dto.email,
          subject: `Documentos — ${label}`,
          text: `Acesse os documentos de ${label} neste link (válido por ${hours}h):\n${url}`,
        });
        await this.log({
          tenantId,
          userId: user.id,
          tipo: ArquivoEventoTipo.share_link_criar,
          detalhe: {
            email: dto.email,
            count: rows.length,
            entityType: dto.entityType,
            entityId: dto.entityId,
            nomes: rows.map((r) => r.nomeExibicao),
          },
        });
      }
      await this.log({
        tenantId,
        userId: user.id,
        tipo: ArquivoEventoTipo.compartilhar_email,
        detalhe: {
          email: dto.email,
          method,
          count: rows.length,
          tags: rows.flatMap((r) => r.tags.map((t) => t.tag.nome)),
          entityType: dto.entityType,
          entityId: dto.entityId,
          nomes: rows.map((r) => r.nomeExibicao),
        },
      });
      return { ok: true, method };
    } catch (error) {
      await this.log({
        tenantId,
        userId: user.id,
        tipo: ArquivoEventoTipo.compartilhar_email,
        detalhe: {
          email: dto.email,
          resultado: 'falha',
          entityType: dto.entityType,
          entityId: dto.entityId,
        },
      });
      throw error;
    }
  }

  private buildZipBuffer(
    files: { filename: string; content: Buffer }[],
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const archive = new ZipArchive({ zlib: { level: 9 } });
      archive.on('data', (c: Buffer) => chunks.push(c));
      archive.on('end', () => resolve(Buffer.concat(chunks)));
      archive.on('error', reject);
      for (const f of files) archive.append(f.content, { name: f.filename });
      void archive.finalize();
    });
  }

  async downloadShare(token: string) {
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const link = await this.prisma.arquivoShareLink.findFirst({
      where: { tokenHash },
      include: {
        itens: { include: { arquivo: true } },
      },
    });
    if (!link || link.revokedAt || link.expiresAt.getTime() < Date.now()) {
      throw new NotFoundException('Link inválido ou expirado.');
    }
    const files = link.itens
      .map((i) => i.arquivo)
      .filter((a) => a && !a.deletedAt);
    if (files.length === 0) {
      throw new NotFoundException('Nenhum arquivo disponível.');
    }
    const buffers: { filename: string; content: Buffer }[] = [];
    for (const arquivo of files) {
      buffers.push({
        filename: sanitizeFilename(arquivo.nomeExibicao),
        content: await this.r2.getObjectBuffer(arquivo.storageKey),
      });
    }
    await this.prisma.arquivoShareLink.update({
      where: { id: link.id },
      data: { usedAt: new Date() },
    });
    await this.log({
      tenantId: link.tenantId,
      tipo: ArquivoEventoTipo.share_link_usar,
      detalhe: { linkId: link.id },
    });
    if (buffers.length === 1) {
      return {
        kind: 'pdf' as const,
        filename: buffers[0].filename,
        buffer: buffers[0].content,
      };
    }
    const zip = await this.buildZipBuffer(buffers);
    return {
      kind: 'zip' as const,
      filename: 'documentos.zip',
      buffer: zip,
    };
  }
}
