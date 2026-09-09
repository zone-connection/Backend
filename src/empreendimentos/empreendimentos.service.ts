import { MediaService } from "../media/media.service";
import {
  EMPREENDIMENTO_MAX_IMAGES,
  resolveEmpreendimentoImages,
  serializeStoredImages,
  type StoredImage,
} from "../media/stored-image";
import { MatchingService } from "../matching/matching.service";
import { CreateEmpreendimentoDto } from "./dto/create-empreendimento.dto";
import { UpdateEmpreendimentoDto } from "./dto/update-empreendimento.dto";
import { QueryEmpreendimentosDto } from "./dto/query-empreendimentos.dto";
import { normalizeCor } from "../common/utils/cor";
import { prismaTableOrderBy } from "../common/utils/table-sort";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { requireTenantId } from "../common/utils/tenant";
import { PrismaService } from "../prisma/prisma.service";
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, Role } from "@prisma/client";

const MATCHING_FIELDS = [
  "cidade",
  "localidadeId",
  "construtoraId",
  "quartos",
  "vagas",
  "valorReferencia",
  "tags",
  "ativo",
] as const;
const empreendimentoSelect = {
  id: true,
  tenantId: true,
  nome: true,
  cor: true,
  construtoraId: true,
  localidadeId: true,
  cidade: true,
  endereco: true,
  tipo: true,
  status: true,
  previsaoEntrega: true,
  tags: true,
  observacao: true,
  quartos: true,
  banheiros: true,
  vagas: true,
  valorReferencia: true,
  rendaAPartirDe: true,
  areaM2: true,
  externalUrl: true,
  imagemUrl: true,
  imagens: true,
  externalKey: true,
  ativo: true,
  oruloBuildingId: true,
  oruloStatus: true,
  oruloSyncedAt: true,
  createdAt: true,
  updatedAt: true,
  construtora: { select: { id: true, nome: true, cor: true } },
  localidade: { select: { id: true, nome: true } },
} as const;

type EmpreendimentoRow = Prisma.EmpreendimentoGetPayload<{
  select: typeof empreendimentoSelect;
}>;

@Injectable()
export class EmpreendimentosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
    private readonly matching: MatchingService,
  ) {}

  async listMatches(id: string, requester: AuthenticatedUser) {
    return this.matching.matchForEmpreendimento(id, requester);
  }

  async list(query: QueryEmpreendimentosDto, requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);
    const items = await this.prisma.empreendimento.findMany({
      where: {
        tenantId,
        ...(query.construtoraId ? { construtoraId: query.construtoraId } : {}),
        ...(query.ativo !== undefined ? { ativo: query.ativo } : {}),
      },
      select: empreendimentoSelect,
      orderBy: prismaTableOrderBy(query.sort, "nome"),
    });
    return items.map((item) => this.present(item));
  }

  async findOne(id: string, requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);
    const item = await this.prisma.empreendimento.findFirst({
      where: { id, tenantId },
      select: empreendimentoSelect,
    });
    if (!item) throw new NotFoundException("Empreendimento não encontrado.");
    return this.present(item);
  }

  private async findRow(id: string, requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);
    const item = await this.prisma.empreendimento.findFirst({
      where: { id, tenantId },
      select: empreendimentoSelect,
    });
    if (!item) throw new NotFoundException("Empreendimento não encontrado.");
    return item;
  }

  async create(dto: CreateEmpreendimentoDto, requester: AuthenticatedUser) {
    this.assertCanCreate(requester);
    const tenantId = requireTenantId(requester);
    if (dto.construtoraId) {
      const construtora = await this.prisma.construtora.findFirst({
        where: { id: dto.construtoraId, tenantId },
        select: { id: true },
      });
      if (!construtora) {
        throw new NotFoundException("Construtora não encontrada.");
      }
    }
    const localidade = await this.resolveLocalidade(
      tenantId,
      dto.localidadeId,
    );
    const key = this.slugify(dto.nome);
    const created = await this.prisma.empreendimento.create({
      data: {
        tenantId,
        nome: dto.nome.trim(),
        cor: normalizeCor(dto.cor),
        construtoraId: dto.construtoraId ?? null,
        localidadeId: localidade?.id ?? null,
        cidade: dto.cidade?.trim() || localidade?.nome || null,
        endereco: dto.endereco?.trim() || null,
        tipo: dto.tipo?.trim() || null,
        status: dto.status?.trim() || null,
        previsaoEntrega: this.toDate(dto.previsaoEntrega),
        tags: this.normalizeTags(dto.tags),
        observacao: dto.observacao?.trim() || null,
        quartos: dto.quartos ?? null,
        banheiros: dto.banheiros ?? null,
        vagas: dto.vagas ?? null,
        valorReferencia: dto.valorReferencia ?? null,
        rendaAPartirDe: dto.rendaAPartirDe ?? null,
        areaM2: dto.areaM2 ?? null,
        externalUrl: dto.externalUrl?.trim() || null,
        imagemUrl: null,
        imagens: [],
        externalKey: `manual-${key}-${Date.now()}`,
        ativo: dto.ativo ?? true,
      },
      select: empreendimentoSelect,
    });
    void this.matching
      .runAfterEmpreendimentoChange(created.id, tenantId)
      .catch(() => undefined);
    return this.present(created);
  }

  async update(
    id: string,
    dto: UpdateEmpreendimentoDto,
    requester: AuthenticatedUser,
  ) {
    this.assertCanManage(requester);
    const row = await this.findRow(id, requester);
    const localidade =
      dto.localidadeId !== undefined
        ? await this.resolveLocalidade(row.tenantId, dto.localidadeId)
        : undefined;
    const shouldRematch = MATCHING_FIELDS.some(
      (field) => dto[field] !== undefined,
    );
    const updated = await this.prisma.empreendimento.update({
      where: { id },
      data: {
        ...(dto.nome !== undefined ? { nome: dto.nome.trim() } : {}),
        ...(dto.cor !== undefined ? { cor: normalizeCor(dto.cor) } : {}),
        ...(dto.construtoraId !== undefined
          ? { construtoraId: dto.construtoraId }
          : {}),
        ...(dto.localidadeId !== undefined
          ? { localidadeId: localidade?.id ?? null }
          : {}),
        ...(dto.cidade !== undefined
          ? { cidade: dto.cidade?.trim() || null }
          : localidade
            ? { cidade: localidade.nome }
            : dto.localidadeId === null
              ? { cidade: null }
              : {}),
        ...(dto.endereco !== undefined
          ? { endereco: dto.endereco?.trim() || null }
          : {}),
        ...(dto.tipo !== undefined ? { tipo: dto.tipo?.trim() || null } : {}),
        ...(dto.status !== undefined
          ? { status: dto.status?.trim() || null }
          : {}),
        ...(dto.previsaoEntrega !== undefined
          ? { previsaoEntrega: this.toDate(dto.previsaoEntrega) }
          : {}),
        ...(dto.tags !== undefined ? { tags: this.normalizeTags(dto.tags) } : {}),
        ...(dto.observacao !== undefined
          ? { observacao: dto.observacao?.trim() || null }
          : {}),
        ...(dto.quartos !== undefined ? { quartos: dto.quartos } : {}),
        ...(dto.banheiros !== undefined ? { banheiros: dto.banheiros } : {}),
        ...(dto.vagas !== undefined ? { vagas: dto.vagas } : {}),
        ...(dto.valorReferencia !== undefined
          ? { valorReferencia: dto.valorReferencia }
          : {}),
        ...(dto.rendaAPartirDe !== undefined
          ? { rendaAPartirDe: dto.rendaAPartirDe }
          : {}),
        ...(dto.areaM2 !== undefined ? { areaM2: dto.areaM2 } : {}),
        ...(dto.externalUrl !== undefined
          ? { externalUrl: dto.externalUrl?.trim() || null }
          : {}),
        ...(dto.ativo !== undefined ? { ativo: dto.ativo } : {}),
      },
      select: empreendimentoSelect,
    });
    if (shouldRematch && updated.ativo) {
      void this.matching
        .runAfterEmpreendimentoChange(updated.id, row.tenantId)
        .catch(() => undefined);
    }
    return this.present(updated);
  }

  async uploadImagem(
    id: string,
    rawFile: Express.Multer.File | undefined,
    requester: AuthenticatedUser,
  ) {
    this.assertCanManage(requester);
    const row = await this.findRow(id, requester);
    const current = resolveEmpreendimentoImages(row);
    if (current.length >= EMPREENDIMENTO_MAX_IMAGES) {
      throw new BadRequestException(
        `Cada empreendimento pode ter no máximo ${EMPREENDIMENTO_MAX_IMAGES} imagens.`,
      );
    }
    const file = this.media.requireFile(rawFile);
    const uploaded = await this.media.uploadImage({
      buffer: file.buffer,
      mimetype: file.mimetype,
      folder: this.media.folder(row.tenantId, "empreendimentos", row.id),
      maxWidth: 1920,
      maxHeight: 1280,
    });
    const next = [...current, uploaded];
    return this.persistImagens(row.id, next);
  }

  async removeImagem(
    id: string,
    index: number,
    requester: AuthenticatedUser,
  ) {
    this.assertCanManage(requester);
    const row = await this.findRow(id, requester);
    const current = resolveEmpreendimentoImages(row);
    if (index < 0 || index >= current.length) {
      throw new NotFoundException("Imagem não encontrada.");
    }
    const [removed] = current.splice(index, 1);
    await this.media.destroy(removed?.publicId);
    return this.persistImagens(row.id, current);
  }

  async remove(id: string, requester: AuthenticatedUser) {
    this.assertCanRemove(requester);
    const row = await this.findRow(id, requester);
    await this.media.destroyMany(
      resolveEmpreendimentoImages(row).map((image) => image.publicId),
    );
    await this.prisma.empreendimento.delete({ where: { id } });
    return { ok: true };
  }

  private persistImagens(id: string, images: StoredImage[]) {
    return this.prisma.empreendimento
      .update({
        where: { id },
        data: {
          imagens: serializeStoredImages(images),
          imagemUrl: images[0]?.url ?? null,
        },
        select: empreendimentoSelect,
      })
      .then((item) => this.present(item));
  }

  private present(item: EmpreendimentoRow) {
    const stored = resolveEmpreendimentoImages(item);
    const { tenantId: _tenantId, previsaoEntrega, ...rest } = item;
    return {
      ...rest,
      previsaoEntrega: previsaoEntrega
        ? previsaoEntrega.toISOString().slice(0, 10)
        : null,
      imagens: stored.map((image) => image.url),
      imagemUrl: stored[0]?.url ?? null,
    };
  }

  private normalizeTags(tags?: string[] | null) {
    if (!tags) return [];
    const seen = new Set<string>();
    const next: string[] = [];
    for (const tag of tags) {
      const label = tag.trim();
      if (!label) continue;
      const key = label.toLocaleLowerCase("pt-BR");
      if (seen.has(key)) continue;
      seen.add(key);
      next.push(label);
    }
    return next;
  }

  private toDate(value?: string | null) {
    if (value === undefined) return undefined;
    if (!value) return null;
    const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private async resolveLocalidade(
    tenantId: string,
    localidadeId?: string | null,
  ) {
    if (!localidadeId) return null;
    const localidade = await this.prisma.localidade.findFirst({
      where: { id: localidadeId, tenantId },
      select: { id: true, nome: true },
    });
    if (!localidade) {
      throw new NotFoundException("Localidade não encontrada.");
    }
    return localidade;
  }

  private assertCanRemove(requester: AuthenticatedUser) {
    if (
      requester.role !== Role.admin &&
      requester.role !== Role.analista &&
      requester.role !== Role.treinee
    ) {
      throw new ForbiddenException(
        "Apenas administradores, analistas e treinees podem remover empreendimentos.",
      );
    }
  }

  private assertCanManage(requester: AuthenticatedUser) {
    if (
      requester.role !== Role.admin &&
      requester.role !== Role.gerente &&
      requester.role !== Role.analista &&
      requester.role !== Role.treinee &&
      requester.role !== Role.corretor
    ) {
      throw new ForbiddenException(
        "Apenas administradores, gerentes, analistas, treinees e corretores podem editar empreendimentos.",
      );
    }
  }

  private assertCanCreate(requester: AuthenticatedUser) {
    if (
      requester.role !== Role.admin &&
      requester.role !== Role.gerente &&
      requester.role !== Role.analista &&
      requester.role !== Role.treinee
    ) {
      throw new ForbiddenException(
        "Apenas administradores, gerentes, analistas e treinees podem cadastrar empreendimentos.",
      );
    }
  }

  private slugify(value: string): string {
    return value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);
  }
}
