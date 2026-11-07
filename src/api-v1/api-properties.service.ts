import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, VendaUsadoStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ListarPropertiesApiDto } from './dto/listar-properties-api.dto';

const imovelPublico = {
  tipo: true,
  descricao: true,
  cidade: true,
  estado: true,
  bairro: true,
  quartos: true,
  banheiros: true,
  vagas: true,
  area: true,
  areaConstruida: true,
  fotoUrl: true,
} satisfies Prisma.ImovelSelect;

const vendaSelect = {
  id: true,
  status: true,
  precoVenda: true,
  updatedAt: true,
  imovel: { select: imovelPublico },
} satisfies Prisma.VendaUsadoSelect;

type VendaRow = Prisma.VendaUsadoGetPayload<{ select: typeof vendaSelect }>;

type Ficha = {
  id: string;
  sourceType: 'venda_usado' | 'captacao' | 'empreendimento';
  purpose: 'venda';
  propertyType: string;
  description: string | null;
  price: string | null;
  location: { city: string | null; state: string | null; neighborhood: string | null };
  features: {
    bedrooms: number | null;
    bathrooms: number | null;
    parkingSpaces: number | null;
    area: string | null;
    builtArea: string | null;
  };
  availability: string;
  coverImage: string | null;
};

function decimal(value: Prisma.Decimal | number | null | undefined): string | null {
  if (value == null) return null;
  if (typeof value === 'number') return value.toFixed(2);
  return value.toFixed(2);
}

function texto(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

function fichaBase(partial: Ficha): Ficha {
  return partial;
}

function respostaVenda(row: VendaRow): Ficha {
  const imovel = row.imovel;
  return fichaBase({
    id: row.id,
    sourceType: 'venda_usado',
    purpose: 'venda',
    propertyType: imovel.tipo,
    description: texto(imovel.descricao),
    price: decimal(row.precoVenda),
    location: {
      city: texto(imovel.cidade),
      state: texto(imovel.estado),
      neighborhood: texto(imovel.bairro),
    },
    features: {
      bedrooms: imovel.quartos,
      bathrooms: imovel.banheiros,
      parkingSpaces: imovel.vagas,
      area: decimal(imovel.area),
      builtArea: decimal(imovel.areaConstruida),
    },
    availability: row.status,
    coverImage: texto(imovel.fotoUrl),
  });
}

const detalheImovel = {
  ...imovelPublico,
  suites: true,
  comodidadesUnidade: true,
  comodidadesCondominio: true,
} satisfies Prisma.ImovelSelect;

function detalheSelect(tenantId: string) {
  return {
    id: true,
    status: true,
    precoVenda: true,
    updatedAt: true,
    imovel: {
      select: {
        ...detalheImovel,
        fotos: {
          where: { tenantId },
          orderBy: { sortOrder: 'asc' as const },
          select: { url: true },
        },
      },
    },
  } satisfies Prisma.VendaUsadoSelect;
}

type DetalheRow = Prisma.VendaUsadoGetPayload<{ select: ReturnType<typeof detalheSelect> }>;

function galeria(capa: string | null, fotos: { url: string }[]) {
  const vistas = new Set<string>();
  if (capa) vistas.add(capa);
  const images: string[] = [];
  for (const foto of fotos) {
    const url = foto.url.trim();
    if (!url || vistas.has(url)) continue;
    vistas.add(url);
    images.push(url);
  }
  return images;
}

function urlsJson(value: Prisma.JsonValue): { url: string }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || !('url' in item)) return [];
    const url = item.url;
    return typeof url === 'string' ? [{ url }] : [];
  });
}

function respostaDetalhe(row: DetalheRow) {
  const ficha = respostaVenda(row);
  const imovel = row.imovel;
  return {
    ...ficha,
    features: {
      ...ficha.features,
      suites: imovel.suites,
      amenities: {
        unit: imovel.comodidadesUnidade,
        building: imovel.comodidadesCondominio,
      },
    },
    images: galeria(ficha.coverImage, imovel.fotos),
  };
}

type CaptacaoRow = Prisma.ImovelGetPayload<{ select: ReturnType<typeof captacaoSelect> }>;

function captacaoSelect(tenantId: string) {
  return {
    id: true,
    updatedAt: true,
    ...detalheImovel,
    fotos: {
      where: { tenantId },
      orderBy: { sortOrder: 'asc' as const },
      select: { url: true },
    },
    captacoes: {
      where: {
        tenantId,
        canceladoPeloProprietario: false,
        motivoPerda: '',
      },
      orderBy: { createdAt: 'desc' as const },
      take: 1,
      select: { valorAvaliacao: true, valorPretendido: true },
    },
  } satisfies Prisma.ImovelSelect;
}

function respostaCaptacao(row: CaptacaoRow) {
  const ultima = row.captacoes[0];
  const cover = texto(row.fotoUrl);
  return {
    id: row.id,
    sourceType: 'captacao' as const,
    purpose: 'venda' as const,
    propertyType: row.tipo,
    description: texto(row.descricao),
    price: decimal(ultima?.valorAvaliacao ?? ultima?.valorPretendido ?? null),
    location: {
      city: texto(row.cidade),
      state: texto(row.estado),
      neighborhood: texto(row.bairro),
    },
    features: {
      bedrooms: row.quartos,
      bathrooms: row.banheiros,
      parkingSpaces: row.vagas,
      area: decimal(row.area),
      builtArea: decimal(row.areaConstruida),
      suites: row.suites,
      amenities: {
        unit: row.comodidadesUnidade,
        building: row.comodidadesCondominio,
      },
    },
    availability: 'captado',
    coverImage: cover,
    images: galeria(cover, row.fotos),
  };
}

const empreendimentoSelect = {
  id: true,
  nome: true,
  tipo: true,
  cidade: true,
  quartos: true,
  banheiros: true,
  vagas: true,
  valorReferencia: true,
  areaM2: true,
  imagemUrl: true,
  imagens: true,
  updatedAt: true,
} satisfies Prisma.EmpreendimentoSelect;

type EmpreendimentoRow = Prisma.EmpreendimentoGetPayload<{ select: typeof empreendimentoSelect }>;

function respostaEmpreendimento(row: EmpreendimentoRow) {
  const cover = texto(row.imagemUrl);
  return {
    id: row.id,
    sourceType: 'empreendimento' as const,
    purpose: 'venda' as const,
    propertyType: texto(row.tipo) ?? 'empreendimento',
    description: texto(row.nome),
    price: decimal(row.valorReferencia),
    location: {
      city: texto(row.cidade),
      state: null,
      neighborhood: null,
    },
    features: {
      bedrooms: row.quartos,
      bathrooms: row.banheiros,
      parkingSpaces: row.vagas,
      area: decimal(row.areaM2),
      builtArea: null,
      suites: null,
      amenities: { unit: [] as string[], building: [] as string[] },
    },
    availability: 'lancamento',
    coverImage: cover,
    images: galeria(cover, urlsJson(row.imagens)),
  };
}

@Injectable()
export class ApiPropertiesService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(tenantId: string, query: ListarPropertiesApiDto) {
    this.validarFaixa(query);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;
    const [totalRow, pagina] = await Promise.all([
      this.prisma.$queryRaw<{ total: bigint }[]>(Prisma.sql`
        SELECT COUNT(*)::bigint AS total FROM (${uniao(tenantId, query)}) AS catalogo
      `),
      this.prisma.$queryRaw<{ id: string; origem: string }[]>(Prisma.sql`
        SELECT id, origem FROM (${uniao(tenantId, query)}) AS catalogo
        ORDER BY atualizado DESC, id DESC
        LIMIT ${limit} OFFSET ${skip}
      `),
    ]);
    const total = Number(totalRow[0]?.total ?? 0);
    const data = await this.hidratar(tenantId, pagina);
    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / limit),
      },
    };
  }

  async detalhe(tenantId: string, id: string) {
    const venda = await this.prisma.vendaUsado.findFirst({
      where: {
        id,
        tenantId,
        status: VendaUsadoStatus.disponivel,
        imovel: { tenantId },
      },
      select: detalheSelect(tenantId),
    });
    if (venda?.imovel) return respostaDetalhe(venda);

    const captado = await this.prisma.imovel.findFirst({
      where: filtroCaptacao(tenantId, id),
      select: captacaoSelect(tenantId),
    });
    if (captado?.captacoes.length) return respostaCaptacao(captado);

    const lancamento = await this.prisma.empreendimento.findFirst({
      where: {
        id,
        tenantId,
        ativo: true,
        visivelNoSite: true,
        NOT: { imovel: { vendaUsado: { is: { status: VendaUsadoStatus.disponivel } } } },
      },
      select: empreendimentoSelect,
    });
    if (lancamento) return respostaEmpreendimento(lancamento);

    throw new NotFoundException('Imóvel não encontrado.');
  }

  private validarFaixa(query: ListarPropertiesApiDto) {
    if (
      query.minPrice != null &&
      query.maxPrice != null &&
      query.minPrice > query.maxPrice
    ) {
      throw new BadRequestException('minPrice não pode ser maior que maxPrice.');
    }
  }

  private async hidratar(
    tenantId: string,
    pagina: { id: string; origem: string }[],
  ): Promise<Ficha[]> {
    const ids = (origem: string) =>
      pagina.filter((item) => item.origem === origem).map((item) => item.id);
    const vendasIds = ids('venda_usado');
    const captacaoIds = ids('captacao');
    const lancamentoIds = ids('empreendimento');
    const [vendas, captacoes, lancamentos] = await Promise.all([
      vendasIds.length
        ? this.prisma.vendaUsado.findMany({
            where: {
              id: { in: vendasIds },
              tenantId,
              status: VendaUsadoStatus.disponivel,
              imovel: { tenantId },
            },
            select: vendaSelect,
          })
        : [],
      captacaoIds.length
        ? this.prisma.imovel.findMany({
            where: { id: { in: captacaoIds }, ...filtroCaptacao(tenantId) },
            select: captacaoSelect(tenantId),
          })
        : [],
      lancamentoIds.length
        ? this.prisma.empreendimento.findMany({
            where: { id: { in: lancamentoIds }, tenantId, ativo: true, visivelNoSite: true },
            select: empreendimentoSelect,
          })
        : [],
    ]);
    const porId = new Map<string, Ficha>();
    for (const row of vendas) porId.set(row.id, respostaVenda(row));
    for (const row of captacoes) {
      if (row.captacoes.length) porId.set(row.id, semGaleria(respostaCaptacao(row)));
    }
    for (const row of lancamentos) porId.set(row.id, semGaleria(respostaEmpreendimento(row)));
    return pagina.flatMap((item) => {
      const ficha = porId.get(item.id);
      return ficha ? [ficha] : [];
    });
  }
}

function semGaleria(ficha: {
  images: string[];
  features: Ficha['features'] & { suites: number | null; amenities: { unit: string[]; building: string[] } };
  id: string;
  sourceType: Ficha['sourceType'];
  purpose: 'venda';
  propertyType: string;
  description: string | null;
  price: string | null;
  location: Ficha['location'];
  availability: string;
  coverImage: string | null;
}): Ficha {
  const { images: _images, features, ...resto } = ficha;
  const { suites: _suites, amenities: _amenities, ...base } = features;
  return { ...resto, features: base };
}

function filtroCaptacao(tenantId: string, id?: string): Prisma.ImovelWhereInput {
  return {
    ...(id ? { id } : {}),
    tenantId,
    vendaUsado: { is: null },
    captacoes: {
      some: {
        tenantId,
        canceladoPeloProprietario: false,
        motivoPerda: '',
      },
    },
  };
}

function parametros(query: ListarPropertiesApiDto) {
  return {
    cityLike: query.city?.trim() ? `%${query.city.trim()}%` : null,
    neighborhoodLike: query.neighborhood?.trim() ? `%${query.neighborhood.trim()}%` : null,
    tipo: query.type ?? null,
    bedrooms: query.bedrooms ?? null,
    bathrooms: query.bathrooms ?? null,
    minPrice: query.minPrice ?? null,
    maxPrice: query.maxPrice ?? null,
  };
}

function uniao(tenantId: string, query: ListarPropertiesApiDto) {
  const p = parametros(query);
  return Prisma.sql`
    SELECT v.id::text AS id, 'venda_usado' AS origem, v."updatedAt" AS atualizado
    FROM vendas_usado v
    INNER JOIN imoveis i ON i.id = v."imovelId" AND i."tenantId" = v."tenantId"
    WHERE v."tenantId" = ${tenantId}
      AND v.status::text = 'disponivel'
      AND (${p.cityLike}::text IS NULL OR i.cidade ILIKE ${p.cityLike})
      AND (${p.neighborhoodLike}::text IS NULL OR i.bairro ILIKE ${p.neighborhoodLike})
      AND (${p.tipo}::text IS NULL OR i.tipo::text = ${p.tipo})
      AND (${p.bedrooms}::int IS NULL OR i.quartos >= ${p.bedrooms}::int)
      AND (${p.bathrooms}::int IS NULL OR i.banheiros >= ${p.bathrooms}::int)
      AND (${p.minPrice}::numeric IS NULL OR v."precoVenda" >= ${p.minPrice}::numeric)
      AND (${p.maxPrice}::numeric IS NULL OR v."precoVenda" <= ${p.maxPrice}::numeric)
    UNION ALL
    SELECT i.id::text AS id, 'captacao' AS origem, i."updatedAt" AS atualizado
    FROM imoveis i
    INNER JOIN LATERAL (
      SELECT COALESCE(c."valorAvaliacao", c."valorPretendido") AS preco
      FROM captacoes c
      WHERE c."imovelId" = i.id
        AND c."tenantId" = i."tenantId"
        AND c."canceladoPeloProprietario" = false
        AND btrim(c."motivoPerda") = ''
      ORDER BY c."createdAt" DESC
      LIMIT 1
    ) cap ON true
    WHERE i."tenantId" = ${tenantId}
      AND NOT EXISTS (SELECT 1 FROM vendas_usado v WHERE v."imovelId" = i.id)
      AND (${p.cityLike}::text IS NULL OR i.cidade ILIKE ${p.cityLike})
      AND (${p.neighborhoodLike}::text IS NULL OR i.bairro ILIKE ${p.neighborhoodLike})
      AND (${p.tipo}::text IS NULL OR i.tipo::text = ${p.tipo})
      AND (${p.bedrooms}::int IS NULL OR i.quartos >= ${p.bedrooms}::int)
      AND (${p.bathrooms}::int IS NULL OR i.banheiros >= ${p.bathrooms}::int)
      AND (${p.minPrice}::numeric IS NULL OR cap.preco >= ${p.minPrice}::numeric)
      AND (${p.maxPrice}::numeric IS NULL OR cap.preco <= ${p.maxPrice}::numeric)
    UNION ALL
    SELECT e.id::text AS id, 'empreendimento' AS origem, e."updatedAt" AS atualizado
    FROM empreendimentos e
    WHERE e."tenantId" = ${tenantId}
      AND e.ativo = true
      AND e."visivelNoSite" = true
      AND NOT EXISTS (
        SELECT 1
        FROM imoveis i
        INNER JOIN vendas_usado v ON v."imovelId" = i.id AND v.status::text = 'disponivel'
        WHERE i."empreendimentoId" = e.id
          AND i."tenantId" = e."tenantId"
      )
      AND (${p.cityLike}::text IS NULL OR e.cidade ILIKE ${p.cityLike})
      AND (${p.neighborhoodLike}::text IS NULL)
      AND (${p.tipo}::text IS NULL OR lower(coalesce(e.tipo, '')) = lower(${p.tipo}))
      AND (${p.bedrooms}::int IS NULL OR e.quartos >= ${p.bedrooms}::int)
      AND (${p.bathrooms}::int IS NULL OR e.banheiros >= ${p.bathrooms}::int)
      AND (${p.minPrice}::numeric IS NULL OR e."valorReferencia" >= ${p.minPrice}::numeric)
      AND (${p.maxPrice}::numeric IS NULL OR e."valorReferencia" <= ${p.maxPrice}::numeric)
  `;
}
