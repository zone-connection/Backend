import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Prisma } from '@prisma/client';
import { ApiAccessGuard } from './api-access.guard';
import { ApiPropertiesService } from './api-properties.service';
import { ListarPropertiesApiDto } from './dto/listar-properties-api.dto';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

type Imovel = {
  tenantId: string;
  tipo: string;
  descricao: string;
  cidade: string;
  estado: string;
  bairro: string;
  quartos: number | null;
  banheiros: number | null;
  vagas: number | null;
  area: Prisma.Decimal | null;
  areaConstruida: Prisma.Decimal | null;
  fotoUrl: string | null;
  logradouro?: string;
  proprietario?: string;
  fotoPublicId?: string;
};

type Row = {
  id: string;
  tenantId: string;
  status: 'disponivel' | 'reservado' | 'vendido' | 'indisponivel';
  precoVenda: Prisma.Decimal | null;
  updatedAt: Date;
  imovel: Imovel | null;
};

function money(value: string | null) {
  return value == null ? null : new Prisma.Decimal(value);
}

function imovel(partial: Partial<Imovel> = {}): Imovel {
  return {
    tenantId: A,
    tipo: 'apartamento',
    descricao: 'Apartamento com varanda',
    cidade: 'Recife',
    estado: 'PE',
    bairro: 'Boa Viagem',
    quartos: 3,
    banheiros: 2,
    vagas: 1,
    area: money('90.00'),
    areaConstruida: money('85.50'),
    fotoUrl: 'https://cdn.exemplo.com/capa.jpg',
    logradouro: 'Av. Boa Viagem',
    proprietario: 'Dono',
    fotoPublicId: 'secret',
    ...partial,
  };
}

function row(partial: Partial<Row> & { id: string; tenantId: string }): Row {
  return {
    status: 'disponivel',
    precoVenda: money('350000.00'),
    updatedAt: new Date('2026-11-07T12:00:00.000Z'),
    imovel: imovel({ tenantId: partial.tenantId }),
    ...partial,
  };
}

function contem(valor: string, termo: string) {
  return valor.toLowerCase().includes(termo.toLowerCase());
}

function casa(where: Record<string, unknown>, item: Row) {
  if (where.tenantId && item.tenantId !== where.tenantId) return false;
  if (where.status && item.status !== where.status) return false;
  const imovelWhere = where.imovel as Record<string, unknown> | undefined;
  if (imovelWhere) {
    if (!item.imovel) return false;
    if (imovelWhere.tenantId && item.imovel.tenantId !== imovelWhere.tenantId) return false;
    const cidade = imovelWhere.cidade as { contains?: string } | undefined;
    if (cidade?.contains && !contem(item.imovel.cidade, cidade.contains)) return false;
    const bairro = imovelWhere.bairro as { contains?: string } | undefined;
    if (bairro?.contains && !contem(item.imovel.bairro, bairro.contains)) return false;
    if (imovelWhere.tipo && item.imovel.tipo !== imovelWhere.tipo) return false;
    const quartos = imovelWhere.quartos as { gte?: number } | undefined;
    if (quartos?.gte != null && (item.imovel.quartos ?? -1) < quartos.gte) return false;
    const banheiros = imovelWhere.banheiros as { gte?: number } | undefined;
    if (banheiros?.gte != null && (item.imovel.banheiros ?? -1) < banheiros.gte) return false;
  }
  const preco = where.precoVenda as { gte?: number; lte?: number } | undefined;
  if (preco) {
    const valor = item.precoVenda == null ? null : Number(item.precoVenda.toString());
    if (valor == null) return false;
    if (preco.gte != null && valor < preco.gte) return false;
    if (preco.lte != null && valor > preco.lte) return false;
  }
  return true;
}

function banco(rows: Row[]) {
  const chamadas = { findMany: 0, count: 0, fotos: 0, imovel: 0 };
  let ultimo: { where?: Record<string, unknown>; orderBy?: unknown; skip?: number; take?: number; select?: unknown } = {};
  let whereCount: Record<string, unknown> | undefined;
  const prisma = {
    chamadas,
    ultimo: () => ultimo,
    whereCount: () => whereCount,
    vendaUsado: {
      count: async ({ where }: { where: Record<string, unknown> }) => {
        chamadas.count += 1;
        whereCount = where;
        return rows.filter((item) => casa(where, item)).length;
      },
      findMany: async (args: typeof ultimo) => {
        chamadas.findMany += 1;
        ultimo = args;
        const select = JSON.stringify(args.select ?? {});
        if (select.includes('publicId') || select.includes('proprietario') || select.includes('logradouro')) {
          throw new Error('select expôs campo interno');
        }
        if (select.includes('fotos')) chamadas.fotos += 1;
        const lista = rows
          .filter((item) => casa(args.where ?? {}, item))
          .sort((a, b) => {
            const tempo = b.updatedAt.getTime() - a.updatedAt.getTime();
            return tempo !== 0 ? tempo : b.id.localeCompare(a.id);
          });
        const skip = args.skip ?? 0;
        const take = args.take ?? lista.length;
        return lista.slice(skip, skip + take).map((item) => ({
          id: item.id,
          status: item.status,
          precoVenda: item.precoVenda,
          updatedAt: item.updatedAt,
          imovel: item.imovel
            ? {
                tipo: item.imovel.tipo,
                descricao: item.imovel.descricao,
                cidade: item.imovel.cidade,
                estado: item.imovel.estado,
                bairro: item.imovel.bairro,
                quartos: item.imovel.quartos,
                banheiros: item.imovel.banheiros,
                vagas: item.imovel.vagas,
                area: item.imovel.area,
                areaConstruida: item.imovel.areaConstruida,
                fotoUrl: item.imovel.fotoUrl,
              }
            : null,
        }));
      },
    },
    imovel: {
      count: async () => {
        chamadas.imovel += 1;
        return 0;
      },
      findMany: async () => {
        chamadas.imovel += 1;
        return [];
      },
    },
  };
  return prisma;
}

async function dto(query: Record<string, unknown>) {
  const instance = plainToInstance(ListarPropertiesApiDto, query);
  const errors = await validate(instance, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return { instance, errors };
}

describe('GET /api/v1/properties', () => {
  const estoque = [
    row({ id: 'v1', tenantId: A, updatedAt: new Date('2026-11-07T15:00:00.000Z') }),
    row({
      id: 'v2',
      tenantId: A,
      updatedAt: new Date('2026-11-07T14:00:00.000Z'),
      precoVenda: money('180000.00'),
      imovel: imovel({ cidade: 'Olinda', bairro: 'Casa Caiada', tipo: 'casa', quartos: 1, banheiros: 1 }),
    }),
    row({ id: 'v3', tenantId: A, status: 'vendido' }),
    row({ id: 'v4', tenantId: A, status: 'reservado' }),
    row({ id: 'v5', tenantId: A, status: 'indisponivel' }),
    row({ id: 'v6', tenantId: A, imovel: null }),
    row({ id: 'vb', tenantId: B, imovel: imovel({ tenantId: B, cidade: 'Recife' }) }),
    row({
      id: 'v7',
      tenantId: A,
      updatedAt: new Date('2026-11-07T15:00:00.000Z'),
      imovel: imovel({ fotoUrl: null, descricao: '' }),
    }),
  ];

  it('lista só disponíveis do tenant, sem dados internos', async () => {
    const db = banco(estoque);
    const service = new ApiPropertiesService(db as never);
    const lista = await service.listar(A, {});
    const ids = lista.data.map((item) => item.id);
    assert.deepEqual(ids, ['v7', 'v1', 'v2']);
    assert.equal(lista.pagination.total, 3);
    assert.equal(lista.pagination.page, 1);
    assert.equal(lista.pagination.limit, 20);
    assert.equal(lista.pagination.totalPages, 1);
    const capa = lista.data.find((item) => item.id === 'v1');
    assert.equal(capa?.sourceType, 'venda_usado');
    assert.equal(capa?.purpose, 'venda');
    assert.equal(capa?.availability, 'disponivel');
    assert.equal(capa?.price, '350000.00');
    assert.equal(capa?.features.area, '90.00');
    assert.equal(capa?.features.builtArea, '85.50');
    assert.equal(capa?.coverImage, 'https://cdn.exemplo.com/capa.jpg');
    assert.equal(capa?.location.city, 'Recife');
    const semFoto = lista.data.find((item) => item.id === 'v7');
    assert.equal(semFoto?.coverImage, null);
    assert.equal(semFoto?.description, null);
    const cru = JSON.stringify(lista);
    for (const proibido of ['tenantId', 'publicId', 'proprietario', 'logradouro', 'Boa Viagem, 100']) {
      assert.equal(cru.includes(proibido), false);
    }
    assert.equal(db.chamadas.findMany, 1);
    assert.equal(db.chamadas.count, 1);
    assert.equal(db.chamadas.imovel, 0);
    assert.equal(db.ultimo().where?.tenantId, A);
    assert.equal(db.ultimo().where?.status, 'disponivel');
    assert.equal((db.ultimo().where?.imovel as { tenantId?: string }).tenantId, A);
    assert.deepEqual(db.ultimo().where, db.whereCount());
    assert.equal(db.ultimo().skip, 0);
    assert.equal(db.ultimo().take, 20);
    assert.equal(db.chamadas.fotos, 0);
    assert.deepEqual(db.ultimo().orderBy, [{ updatedAt: 'desc' }, { id: 'desc' }]);
  });

  it('lista vazia mantém paginação zerada', async () => {
    const service = new ApiPropertiesService(banco([]) as never);
    const lista = await service.listar(A, {});
    assert.deepEqual(lista.data, []);
    assert.equal(lista.pagination.total, 0);
    assert.equal(lista.pagination.totalPages, 0);
  });

  it('combina cidade, bairro, tipo, cômodos e preço sem diferenciar maiúsculas', async () => {
    const db = banco(estoque);
    const service = new ApiPropertiesService(db as never);
    const lista = await service.listar(A, {
      city: 'recife',
      neighborhood: 'boa',
      type: 'apartamento' as never,
      bedrooms: 2,
      bathrooms: 2,
      minPrice: 200000,
      maxPrice: 600000,
    });
    assert.deepEqual(lista.data.map((item) => item.id), ['v7', 'v1']);
    assert.equal(lista.pagination.total, 2);
  });

  it('pagina no banco e desempata pela data e pelo id', async () => {
    const db = banco(estoque);
    const service = new ApiPropertiesService(db as never);
    const pagina = await service.listar(A, { page: 2, limit: 1 });
    assert.deepEqual(pagina.data.map((item) => item.id), ['v1']);
    assert.equal(pagina.pagination.total, 3);
    assert.equal(pagina.pagination.totalPages, 3);
    assert.equal(db.ultimo().skip, 1);
    assert.equal(db.ultimo().take, 1);
    assert.deepEqual(db.ultimo().where, db.whereCount());
  });

  it('rejeita faixa de preço invertida', async () => {
    const service = new ApiPropertiesService(banco(estoque) as never);
    await assert.rejects(
      () => service.listar(A, { minPrice: 10, maxPrice: 1 }),
      BadRequestException,
    );
  });

  it('envia a faixa de preço só em precoVenda e não consulta captação', async () => {
    const db = banco(estoque);
    const service = new ApiPropertiesService(db as never);
    await service.listar(A, { minPrice: 200000, maxPrice: 600000 });
    assert.deepEqual(db.ultimo().where?.precoVenda, { gte: 200000, lte: 600000 });
    assert.equal(JSON.stringify(db.ultimo().where).includes('valorPretendido'), false);
    assert.equal(JSON.stringify(db.ultimo().where).includes('valorAvaliacao'), false);
    assert.equal(db.chamadas.imovel, 0);
    assert.deepEqual(db.ultimo().where, db.whereCount());
  });

  it('o tenant do outro lado não vê o estoque alheio', async () => {
    const service = new ApiPropertiesService(banco(estoque) as never);
    const deB = await service.listar(B, {});
    assert.deepEqual(deB.data.map((item) => item.id), ['vb']);
  });

  it('valida página, limite, números e recusa tenant externo', async () => {
    const pagina = await dto({ page: 0 });
    assert.equal(pagina.errors.length > 0, true);
    const limite = await dto({ limit: 101 });
    assert.equal(limite.errors.length > 0, true);
    const teto = await dto({ limit: 100 });
    assert.equal(teto.errors.length, 0);
    assert.equal(teto.instance.limit, 100);
    const quarto = await dto({ bedrooms: -1, bathrooms: 1.5 });
    assert.equal(quarto.errors.length > 0, true);
    const preco = await dto({ minPrice: -1, maxPrice: 'abc' });
    assert.equal(preco.errors.length > 0, true);
    const tipo = await dto({ type: 'aluguel' });
    assert.equal(tipo.errors.length > 0, true);
    const vazio = await dto({ city: '  ', neighborhood: '' });
    assert.equal(vazio.errors.length, 0);
    assert.equal(vazio.instance.city, undefined);
    const externo = await dto({ tenantId: B });
    assert.equal(externo.errors.some((erro) => erro.property === 'tenantId'), true);
  });

  it('rejeita token sem scope e token ausente', async () => {
    const contexto = {
      switchToHttp: () => ({ getRequest: () => ({ header: () => 'Bearer token' }) }),
      getHandler: () => null,
      getClass: () => null,
    };
    const semScope = new ApiAccessGuard(
      {
        authenticate: async () => ({
          sub: 'zc',
          appId: 'app',
          tenantId: A,
          scopes: ['leads:read'],
          jti: 'j',
        }),
      } as never,
      { getAllAndOverride: () => ['properties:read'] } as never,
    );
    await assert.rejects(() => semScope.canActivate(contexto as never), ForbiddenException);
    const invalido = new ApiAccessGuard(
      { authenticate: async () => { throw new UnauthorizedException('token inválido'); } } as never,
      { getAllAndOverride: () => ['properties:read'] } as never,
    );
    await assert.rejects(() => invalido.canActivate(contexto as never), UnauthorizedException);
  });
});
