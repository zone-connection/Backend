import { BadRequestException, Injectable } from '@nestjs/common';
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
