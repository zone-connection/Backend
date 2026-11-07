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

function decimal(value: Prisma.Decimal | null | undefined): string | null {
  if (value == null) return null;
  return value.toFixed(2);
}

function texto(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

function respostaPublica(row: VendaRow) {
  const imovel = row.imovel;
  return {
    id: row.id,
    sourceType: 'venda_usado' as const,
    purpose: 'venda' as const,
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
  };
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

function respostaDetalhe(row: DetalheRow) {
  const ficha = respostaPublica(row);
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

@Injectable()
export class ApiPropertiesService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(tenantId: string, query: ListarPropertiesApiDto) {
    if (
      query.minPrice != null &&
      query.maxPrice != null &&
      query.minPrice > query.maxPrice
    ) {
      throw new BadRequestException('minPrice não pode ser maior que maxPrice.');
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = filtroVenda(tenantId, query);
    const [total, rows] = await Promise.all([
      this.prisma.vendaUsado.count({ where }),
      this.prisma.vendaUsado.findMany({
        where,
        select: vendaSelect,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: rows.map((row) => respostaPublica(row)),
      pagination: {
        page,
        limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / limit),
      },
    };
  }

  async detalhe(tenantId: string, id: string) {
    const row = await this.prisma.vendaUsado.findFirst({
      where: {
        id,
        tenantId,
        status: VendaUsadoStatus.disponivel,
        imovel: { tenantId },
      },
      select: detalheSelect(tenantId),
    });
    if (!row?.imovel) throw new NotFoundException('Imóvel não encontrado.');
    return respostaDetalhe(row);
  }
}

function filtroVenda(
  tenantId: string,
  query: ListarPropertiesApiDto,
): Prisma.VendaUsadoWhereInput {
  const imovel: Prisma.ImovelWhereInput = { tenantId };
  const city = query.city?.trim();
  const neighborhood = query.neighborhood?.trim();
  if (city) imovel.cidade = { contains: city, mode: 'insensitive' };
  if (neighborhood) imovel.bairro = { contains: neighborhood, mode: 'insensitive' };
  if (query.type) imovel.tipo = query.type;
  if (query.bedrooms != null) imovel.quartos = { gte: query.bedrooms };
  if (query.bathrooms != null) imovel.banheiros = { gte: query.bathrooms };

  const preco: Prisma.DecimalNullableFilter = {};
  if (query.minPrice != null) preco.gte = query.minPrice;
  if (query.maxPrice != null) preco.lte = query.maxPrice;

  return {
    tenantId,
    status: VendaUsadoStatus.disponivel,
    imovel,
    ...(query.minPrice != null || query.maxPrice != null ? { precoVenda: preco } : {}),
  };
}
