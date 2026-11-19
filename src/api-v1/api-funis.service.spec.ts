import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ApiAccessGuard } from './api-access.guard';
import { ApiFunisService } from './api-funis.service';

const funilA = {
  id: '11111111-1111-4111-8111-111111111111',
  tenantId: 'tenant-a',
  name: 'Funil padrão',
  tipo: 'comercial',
  ativo: true,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  etapas: [
    {
      id: 'etapa-1',
      label: 'Novo lead',
      slug: 'novo',
      sortOrder: 0,
      active: true,
      papel: 'inicial',
      prazoValor: null,
      prazoUnidade: 'horas',
    },
  ],
};

function prisma(rows: Array<typeof funilA & { tenantId: string }>) {
  return {
    funil: {
      findMany: async ({ where }: { where: { tenantId: string } }) =>
        rows
          .filter((row) => row.tenantId === where.tenantId)
          .map((row) => ({
            id: row.id,
            name: row.name,
            tipo: row.tipo,
            ativo: row.ativo,
            _count: { etapas: row.etapas.length },
          })),
      findFirst: async ({ where }: { where: { id: string; tenantId: string } }) =>
        rows.find((row) => row.id === where.id && row.tenantId === where.tenantId) ?? null,
    },
  };
}

describe('API v1 funis', () => {
  it('lista só os funis do tenant e não inventa etapa', async () => {
    const service = new ApiFunisService(
      prisma([
        funilA,
        { ...funilA, id: 'outro', tenantId: 'tenant-b', name: 'Beta' },
      ]) as never,
    );
    const lista = await service.listar('tenant-a');
    assert.equal(lista.data.length, 1);
    assert.equal(lista.data[0].nome, 'Funil padrão');
    assert.equal(lista.data[0].tipo, 'comercial');
    assert.equal(lista.data[0].ativo, true);
    assert.equal(lista.data[0].quantidadeEtapas, 1);
  });

  it('consulta o funil e as etapas reais', async () => {
    const service = new ApiFunisService(prisma([funilA]) as never);
    const detalhe = await service.detalhe('tenant-a', funilA.id);
    assert.equal(detalhe.nome, 'Funil padrão');
    const etapas = await service.etapas('tenant-a', funilA.id);
    assert.equal(etapas.data[0].slug, 'novo');
    assert.equal(etapas.data[0].ordem, 0);
    assert.equal(etapas.data[0].nome, 'Novo lead');
  });

  it('tenant sem funil recebe lista vazia', async () => {
    const service = new ApiFunisService(prisma([]) as never);
    const lista = await service.listar('tenant-a');
    assert.deepEqual(lista.data, []);
  });

  it('funil inexistente ou de outro tenant responde 404', async () => {
    const service = new ApiFunisService(
      prisma([{ ...funilA, tenantId: 'tenant-b' }]) as never,
    );
    await assert.rejects(
      () => service.detalhe('tenant-a', funilA.id),
      NotFoundException,
    );
    await assert.rejects(
      () => service.etapas('tenant-a', '00000000-0000-4000-8000-000000000099'),
      NotFoundException,
    );
  });

  it('rejeita token sem o scope funnels:read', async () => {
    const guard = new ApiAccessGuard(
      {
        authenticate: async () => ({
          sub: 'zc_abc',
          appId: 'app',
          tenantId: 'tenant-a',
          scopes: ['leads:read'],
          jti: 'j',
        }),
      } as never,
      { getAllAndOverride: () => ['funnels:read'] } as never,
    );
    await assert.rejects(
      () =>
        guard.canActivate({
          switchToHttp: () => ({
            getRequest: () => ({ header: () => 'Bearer token' }),
          }),
          getHandler: () => null,
          getClass: () => null,
        } as never),
      ForbiddenException,
    );
  });
});
