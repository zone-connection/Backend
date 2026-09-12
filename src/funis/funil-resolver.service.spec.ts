import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { FunilTipo } from '@prisma/client';
import { FunilResolverService } from './funil-resolver.service';

function etapa(id = 'e1') {
  return { id, sortOrder: 0, active: true, label: 'Início' };
}

function funil(overrides: Record<string, unknown> = {}) {
  return {
    id: 'f-cap',
    tenantId: 't1',
    name: 'Captação',
    tipo: FunilTipo.captacao,
    ativo: true,
    etapas: [etapa()],
    ...overrides,
  };
}

describe('FunilResolverService', () => {
  it('usa o funil explícito quando informado e ativo', async () => {
    const explicit = funil({ id: 'f-exp' });
    const service = new FunilResolverService({
      funil: { findFirst: async () => explicit },
    } as never);
    const result = await service.resolve({
      tenantId: 't1',
      tipo: FunilTipo.captacao,
      funilId: 'f-exp',
    });
    assert.equal(result.id, 'f-exp');
  });

  it('recusa funil explícito de outro tipo', async () => {
    const service = new FunilResolverService({
      funil: {
        findFirst: async () => funil({ tipo: FunilTipo.comercial }),
      },
    } as never);
    await assert.rejects(
      () =>
        service.resolve({
          tenantId: 't1',
          tipo: FunilTipo.captacao,
          funilId: 'f-com',
        }),
      BadRequestException,
    );
  });

  it('recusa funil explícito inativo', async () => {
    const service = new FunilResolverService({
      funil: { findFirst: async () => funil({ ativo: false }) },
    } as never);
    await assert.rejects(
      () =>
        service.resolve({
          tenantId: 't1',
          tipo: FunilTipo.captacao,
          funilId: 'f-cap',
        }),
      BadRequestException,
    );
  });

  it('usuário com equipe usa o funil da equipe se estiver ativo', async () => {
    const teamFunil = funil({ id: 'f-eq' });
    const service = new FunilResolverService({
      user: {
        findFirst: async () => ({ equipeId: 'eq1', equipeGerenciada: null }),
      },
      equipeFunil: {
        findUnique: async () => ({ funil: teamFunil }),
      },
    } as never);
    const result = await service.resolve({
      tenantId: 't1',
      tipo: FunilTipo.captacao,
      userId: 'u1',
    });
    assert.equal(result.id, 'f-eq');
  });

  it('usuário sem equipe usa o funil padrão do tenant', async () => {
    const padrao = funil({ id: 'f-padrao' });
    const service = new FunilResolverService({
      user: { findFirst: async () => ({ equipeId: null, equipeGerenciada: null }) },
      funil: { findFirst: async () => padrao },
    } as never);
    const result = await service.resolve({
      tenantId: 't1',
      tipo: FunilTipo.captacao,
      userId: 'u1',
    });
    assert.equal(result.id, 'f-padrao');
  });

  it('equipe sem configuração usa o funil padrão', async () => {
    const padrao = funil({ id: 'f-padrao' });
    const service = new FunilResolverService({
      user: { findFirst: async () => ({ equipeId: 'eq1', equipeGerenciada: null }) },
      equipeFunil: { findUnique: async () => null },
      funil: { findFirst: async () => padrao },
    } as never);
    const result = await service.resolve({
      tenantId: 't1',
      tipo: FunilTipo.captacao,
      userId: 'u1',
    });
    assert.equal(result.id, 'f-padrao');
  });

  it('funil da equipe inativo cai no padrão do tenant', async () => {
    const padrao = funil({ id: 'f-padrao' });
    const service = new FunilResolverService({
      user: { findFirst: async () => ({ equipeId: 'eq1', equipeGerenciada: null }) },
      equipeFunil: {
        findUnique: async () => ({
          funil: funil({ id: 'f-eq', ativo: false }),
        }),
      },
      funil: { findFirst: async () => padrao },
    } as never);
    const result = await service.resolve({
      tenantId: 't1',
      tipo: FunilTipo.captacao,
      userId: 'u1',
    });
    assert.equal(result.id, 'f-padrao');
  });

  it('sem funil disponível retorna erro do tipo pedido (não cai no comercial)', async () => {
    const service = new FunilResolverService({
      user: { findFirst: async () => ({ equipeId: null, equipeGerenciada: null }) },
      funil: { findFirst: async () => null },
    } as never);
    await assert.rejects(
      () =>
        service.resolve({
          tenantId: 't1',
          tipo: FunilTipo.captacao,
          userId: 'u1',
        }),
      (err: unknown) => {
        assert.ok(err instanceof BadRequestException);
        assert.match(String((err as BadRequestException).message), /Captação/);
        return true;
      },
    );
  });

  it('gerente sem equipeId usa a equipe que lidera', async () => {
    const teamFunil = funil({ id: 'f-ger' });
    const service = new FunilResolverService({
      user: {
        findFirst: async () => ({
          equipeId: null,
          equipeGerenciada: { id: 'eq-g' },
        }),
      },
      equipeFunil: { findUnique: async () => ({ funil: teamFunil }) },
    } as never);
    const result = await service.resolve({
      tenantId: 't1',
      tipo: FunilTipo.captacao,
      userId: 'g1',
    });
    assert.equal(result.id, 'f-ger');
  });
});
