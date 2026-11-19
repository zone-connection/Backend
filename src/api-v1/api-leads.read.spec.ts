import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ApiAccessGuard } from './api-access.guard';
import { ApiLeadsService } from './api-leads.service';
import { ListarLeadsApiDto } from './dto/listar-leads-api.dto';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

type Row = {
  id: string;
  tenantId: string;
  tipo: string;
  perdidoAt: Date | null;
  nome: string;
  telefone: string;
  email: string;
  origem: string;
  interesse: string;
  cidade: string;
  bairro: string;
  stage: string;
  funilId: string;
  prioridade: string;
  corretorId: string | null;
  corretor: { name: string; cpf: string } | null;
  cpf: string;
  createdAt: Date;
  updatedAt: Date;
};

function row(partial: Partial<Row> & { id: string; tenantId: string; nome: string }): Row {
  return {
    tipo: 'lead',
    perdidoAt: null,
    telefone: '(81) 98888-7777',
    email: 'a@email.com',
    origem: 'Site',
    interesse: 'Comprar',
    cidade: 'Recife',
    bairro: 'Boa Viagem',
    stage: 'novo',
    funilId: 'funil-a',
    prioridade: 'Média',
    corretorId: null,
    corretor: null,
    cpf: '12345678900',
    createdAt: new Date('2026-11-07T12:00:00.000Z'),
    updatedAt: new Date('2026-11-07T12:00:00.000Z'),
    ...partial,
  };
}

function banco(rows: Row[]) {
  function match(where: {
    tenantId?: string;
    id?: string;
    stage?: string;
    origem?: string;
    tipo?: string;
    perdidoAt?: null;
    OR?: Array<Record<string, { contains: string }>>;
  }, item: Row) {
    if (where.tenantId && item.tenantId !== where.tenantId) return false;
    if (where.id && item.id !== where.id) return false;
    if (where.tipo && item.tipo !== where.tipo) return false;
    if (where.perdidoAt === null && item.perdidoAt) return false;
    if (where.stage && item.stage !== where.stage) return false;
    if (where.origem && item.origem !== where.origem) return false;
    if (where.OR) {
      const ok = where.OR.some((clause) => {
        const [field, cond] = Object.entries(clause)[0];
        const value = String(item[field as keyof Row] ?? '').toLowerCase();
        return value.includes(cond.contains.toLowerCase());
      });
      if (!ok) return false;
    }
    return true;
  }
  return {
    lead: {
      count: async ({ where }: { where: Parameters<typeof match>[0] }) =>
        rows.filter((item) => match(where, item)).length,
      findMany: async ({
        where,
        orderBy,
        skip,
        take,
      }: {
        where: Parameters<typeof match>[0];
        orderBy: Record<string, 'asc' | 'desc'>;
        skip: number;
        take: number;
      }) => {
        const [field, dir] = Object.entries(orderBy)[0];
        return rows
          .filter((item) => match(where, item))
          .sort((left, right) => {
            const a = left[field as keyof Row];
            const b = right[field as keyof Row];
            const cmp = a instanceof Date && b instanceof Date
              ? a.getTime() - b.getTime()
              : String(a).localeCompare(String(b));
            return dir === 'asc' ? cmp : -cmp;
          })
          .slice(skip, skip + take);
      },
      findFirst: async ({ where }: { where: Parameters<typeof match>[0] }) =>
        rows.find((item) => match(where, item)) ?? null,
    },
  };
}

function service(rows: Row[]) {
  return new ApiLeadsService(banco(rows) as never, {} as never, {} as never);
}

const leads = [
  row({ id: 'l1', tenantId: A, nome: 'Ana', origem: 'Site', stage: 'novo', createdAt: new Date('2026-11-01T00:00:00.000Z') }),
  row({ id: 'l2', tenantId: A, nome: 'Bruno', origem: 'Indicação', stage: 'contato', createdAt: new Date('2026-11-03T00:00:00.000Z'), cpf: '999', corretor: { name: 'Carla', cpf: '000' } }),
  row({ id: 'l3', tenantId: B, nome: 'Ana', origem: 'Site', stage: 'novo' }),
  row({ id: 'perdido', tenantId: A, nome: 'Perdido', perdidoAt: new Date() }),
];

describe('GET /api/v1/leads', () => {
  it('lista só o tenant, esconde dados internos e pagina', async () => {
    const lista = await service(leads).listar(A, { page: 1, limit: 1, sort: 'nome_asc' });
    assert.equal(lista.pagination.total, 2);
    assert.equal(lista.pagination.totalPages, 2);
    assert.equal(lista.pagination.limit, 1);
    assert.equal(lista.data.length, 1);
    assert.equal(lista.data[0].nome, 'Ana');
    assert.equal(lista.data.some((item) => item.id === 'l3'), false);
    assert.equal('cpf' in lista.data[0], false);
  });

  it('usa limite 20 quando não informado', async () => {
    const lista = await service(leads).listar(A, {});
    assert.equal(lista.pagination.limit, 20);
    assert.equal(lista.pagination.page, 1);
  });

  it('filtra busca, etapa e origem e ordena por criação', async () => {
    const api = service(leads);
    const busca = await api.listar(A, { search: 'bru' });
    assert.deepEqual(busca.data.map((item) => item.id), ['l2']);
    const etapa = await api.listar(A, { stage: 'contato' });
    assert.deepEqual(etapa.data.map((item) => item.id), ['l2']);
    const origem = await api.listar(A, { origem: 'Site' });
    assert.deepEqual(origem.data.map((item) => item.id), ['l1']);
    const ordem = await api.listar(A, { sort: 'created_asc' });
    assert.deepEqual(ordem.data.map((item) => item.id), ['l1', 'l2']);
    assert.equal(ordem.data[1].corretorNome, 'Carla');
    assert.equal('cpf' in ordem.data[1], false);
  });

  it('recusa paginação, limite e ordenação inválidos e ignora tenant externo', async () => {
    const limite = plainToInstance(ListarLeadsApiDto, { limit: 101 });
    const ordem = plainToInstance(ListarLeadsApiDto, { sort: 'id' });
    const pagina = plainToInstance(ListarLeadsApiDto, { page: 0 });
    const externo = plainToInstance(ListarLeadsApiDto, { tenantId: B, page: 1 });
    assert.equal((await validate(limite)).length > 0, true);
    assert.equal((await validate(ordem)).length > 0, true);
    assert.equal((await validate(pagina)).length > 0, true);
    const erros = await validate(externo, { whitelist: true, forbidNonWhitelisted: true });
    assert.equal(erros.some((erro) => erro.property === 'tenantId'), true);
  });

  it('scope ausente responde 403', async () => {
    const guard = new ApiAccessGuard(
      {
        authenticate: async () => ({
          sub: 'zc_abc',
          appId: 'app',
          tenantId: A,
          scopes: ['leads:write'],
          jti: 'j',
        }),
      } as never,
      { getAllAndOverride: () => ['leads:read'] } as never,
    );
    await assert.rejects(
      () =>
        guard.canActivate({
          switchToHttp: () => ({ getRequest: () => ({ header: () => 'Bearer token' }) }),
          getHandler: () => null,
          getClass: () => null,
        } as never),
      ForbiddenException,
    );
  });
});

describe('GET /api/v1/leads/:id', () => {
  it('devolve o lead do tenant e 404 para outro tenant ou inexistente', async () => {
    const api = service(leads);
    const proprio = await api.detalhe(A, 'l2');
    assert.equal(proprio.nome, 'Bruno');
    assert.equal(proprio.corretorNome, 'Carla');
    assert.equal('cpf' in proprio, false);
    await assert.rejects(() => api.detalhe(B, 'l2'), NotFoundException);
    await assert.rejects(() => api.detalhe(A, 'nao-existe'), NotFoundException);
    await assert.rejects(() => api.detalhe(A, 'perdido'), NotFoundException);
  });
});
