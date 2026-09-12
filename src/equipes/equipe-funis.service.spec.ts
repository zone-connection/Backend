import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { FunilTipo, Role } from '@prisma/client';
import { EquipeFunisService } from './equipe-funis.service';
import type { AuthenticatedUser } from '../common/types/authenticated-user';

function admin(): AuthenticatedUser {
  return {
    id: 'u-admin',
    email: 'a@t.com',
    role: Role.admin,
    name: 'Admin',
    tenantId: 't1',
  };
}

function corretor(): AuthenticatedUser {
  return { ...admin(), id: 'u-cor', role: Role.corretor, name: 'João' };
}

describe('EquipeFunisService', () => {
  it('cria associação equipe → funil do mesmo tenant', async () => {
    const upserts: unknown[] = [];
    const service = new EquipeFunisService({
      equipe: { findFirst: async () => ({ id: 'eq1', tenantId: 't1' }) },
      equipeFunil: {
        findMany: async () => [
          {
            tipo: FunilTipo.captacao,
            funil: {
              id: 'f-cap',
              name: 'Captação',
              tipo: FunilTipo.captacao,
              ativo: true,
            },
          },
        ],
        upsert: async (args: unknown) => {
          upserts.push(args);
        },
        deleteMany: async () => ({ count: 0 }),
      },
      funil: {
        findFirst: async () => ({
          id: 'f-cap',
          tenantId: 't1',
          tipo: FunilTipo.captacao,
          ativo: true,
        }),
      },
      $transaction: async (fn: (tx: unknown) => unknown) =>
        fn({
          equipeFunil: {
            upsert: async (args: unknown) => {
              upserts.push(args);
            },
            deleteMany: async () => ({ count: 0 }),
          },
          funil: {
            findFirst: async () => ({
              id: 'f-cap',
              tenantId: 't1',
              tipo: FunilTipo.captacao,
              ativo: true,
            }),
          },
        }),
    } as never);

    const result = await service.replaceForEquipe(
      'eq1',
      { captacao: 'f-cap' },
      admin(),
    );
    assert.equal(result.captacao?.id, 'f-cap');
    assert.equal(upserts.length, 1);
  });

  it('impede funil de outro tenant', async () => {
    const service = new EquipeFunisService({
      equipe: { findFirst: async () => ({ id: 'eq1', tenantId: 't1' }) },
      $transaction: async (fn: (tx: unknown) => unknown) =>
        fn({
          funil: { findFirst: async () => null },
          equipeFunil: { upsert: async () => ({}), deleteMany: async () => ({}) },
        }),
    } as never);
    await assert.rejects(
      () => service.replaceForEquipe('eq1', { captacao: 'f-other' }, admin()),
      BadRequestException,
    );
  });

  it('impede equipe inexistente neste tenant', async () => {
    const service = new EquipeFunisService({
      equipe: { findFirst: async () => null },
    } as never);
    await assert.rejects(
      () => service.replaceForEquipe('eq-x', { captacao: 'f-cap' }, admin()),
      NotFoundException,
    );
  });

  it('impede funil inativo', async () => {
    const service = new EquipeFunisService({
      equipe: { findFirst: async () => ({ id: 'eq1', tenantId: 't1' }) },
      $transaction: async (fn: (tx: unknown) => unknown) =>
        fn({
          funil: {
            findFirst: async () => ({
              id: 'f-cap',
              tenantId: 't1',
              tipo: FunilTipo.captacao,
              ativo: false,
            }),
          },
          equipeFunil: { upsert: async () => ({}), deleteMany: async () => ({}) },
        }),
    } as never);
    await assert.rejects(
      () => service.replaceForEquipe('eq1', { captacao: 'f-cap' }, admin()),
      BadRequestException,
    );
  });

  it('impede tipo incompatível', async () => {
    const service = new EquipeFunisService({
      equipe: { findFirst: async () => ({ id: 'eq1', tenantId: 't1' }) },
      $transaction: async (fn: (tx: unknown) => unknown) =>
        fn({
          funil: {
            findFirst: async () => ({
              id: 'f-com',
              tenantId: 't1',
              tipo: FunilTipo.comercial,
              ativo: true,
            }),
          },
          equipeFunil: { upsert: async () => ({}), deleteMany: async () => ({}) },
        }),
    } as never);
    await assert.rejects(
      () => service.replaceForEquipe('eq1', { captacao: 'f-com' }, admin()),
      BadRequestException,
    );
  });

  it('corretor não altera funis da equipe', async () => {
    const service = new EquipeFunisService({} as never);
    await assert.rejects(
      () => service.replaceForEquipe('eq1', { captacao: 'f-cap' }, corretor()),
      ForbiddenException,
    );
  });

  it('remove associação quando o campo vem null', async () => {
    let deleted = false;
    const service = new EquipeFunisService({
      equipe: { findFirst: async () => ({ id: 'eq1', tenantId: 't1' }) },
      equipeFunil: { findMany: async () => [] },
      $transaction: async (fn: (tx: unknown) => unknown) =>
        fn({
          equipeFunil: {
            deleteMany: async () => {
              deleted = true;
              return { count: 1 };
            },
            upsert: async () => ({}),
          },
          funil: { findFirst: async () => null },
        }),
    } as never);
    await service.replaceForEquipe('eq1', { captacao: null }, admin());
    assert.equal(deleted, true);
  });

  it('substitui o funil do mesmo tipo (upsert por equipe+tipo)', async () => {
    let where: unknown;
    const service = new EquipeFunisService({
      equipe: { findFirst: async () => ({ id: 'eq1', tenantId: 't1' }) },
      equipeFunil: { findMany: async () => [] },
      $transaction: async (fn: (tx: unknown) => unknown) =>
        fn({
          funil: {
            findFirst: async () => ({
              id: 'f-cap-b',
              tenantId: 't1',
              tipo: FunilTipo.captacao,
              ativo: true,
            }),
          },
          equipeFunil: {
            upsert: async (args: { where: unknown }) => {
              where = args.where;
            },
            deleteMany: async () => ({ count: 0 }),
          },
        }),
    } as never);
    await service.replaceForEquipe('eq1', { captacao: 'f-cap-b' }, admin());
    assert.deepEqual(where, {
      equipeId_tipo: { equipeId: 'eq1', tipo: FunilTipo.captacao },
    });
  });

  it('permite comercial e captação simultâneos', async () => {
    const tipos: FunilTipo[] = [];
    const service = new EquipeFunisService({
      equipe: { findFirst: async () => ({ id: 'eq1', tenantId: 't1' }) },
      equipeFunil: { findMany: async () => [] },
      $transaction: async (fn: (tx: unknown) => unknown) =>
        fn({
          funil: {
            findFirst: async (args: { where: { id: string } }) => ({
              id: args.where.id,
              tenantId: 't1',
              tipo:
                args.where.id === 'f-com'
                  ? FunilTipo.comercial
                  : FunilTipo.captacao,
              ativo: true,
            }),
          },
          equipeFunil: {
            upsert: async (args: { create: { tipo: FunilTipo } }) => {
              tipos.push(args.create.tipo);
            },
            deleteMany: async () => ({ count: 0 }),
          },
        }),
    } as never);
    await service.replaceForEquipe(
      'eq1',
      { comercial: 'f-com', captacao: 'f-cap' },
      admin(),
    );
    assert.deepEqual(tipos.sort(), [FunilTipo.captacao, FunilTipo.comercial].sort());
  });

  it('permite captação e venda de usados simultâneos', async () => {
    const tipos: FunilTipo[] = [];
    const service = new EquipeFunisService({
      equipe: { findFirst: async () => ({ id: 'eq1', tenantId: 't1' }) },
      equipeFunil: { findMany: async () => [] },
      $transaction: async (fn: (tx: unknown) => unknown) =>
        fn({
          funil: {
            findFirst: async (args: { where: { id: string } }) => ({
              id: args.where.id,
              tenantId: 't1',
              tipo:
                args.where.id === 'f-vu'
                  ? FunilTipo.venda_usados
                  : FunilTipo.captacao,
              ativo: true,
            }),
          },
          equipeFunil: {
            upsert: async (args: { create: { tipo: FunilTipo } }) => {
              tipos.push(args.create.tipo);
            },
            deleteMany: async () => ({ count: 0 }),
          },
        }),
    } as never);
    await service.replaceForEquipe(
      'eq1',
      { captacao: 'f-cap', venda_usados: 'f-vu' },
      admin(),
    );
    assert.deepEqual(tipos.sort(), [
      FunilTipo.captacao,
      FunilTipo.venda_usados,
    ].sort());
  });

  it('alterar funis não toca captações existentes', async () => {
    const calls: string[] = [];
    const service = new EquipeFunisService({
      equipe: { findFirst: async () => ({ id: 'eq1', tenantId: 't1' }) },
      equipeFunil: { findMany: async () => [] },
      captacao: {
        updateMany: async () => {
          calls.push('captacao.updateMany');
        },
      },
      $transaction: async (fn: (tx: unknown) => unknown) =>
        fn({
          funil: {
            findFirst: async () => ({
              id: 'f-cap',
              tenantId: 't1',
              tipo: FunilTipo.captacao,
              ativo: true,
            }),
          },
          equipeFunil: {
            upsert: async () => ({}),
            deleteMany: async () => ({ count: 0 }),
          },
        }),
    } as never);
    await service.replaceForEquipe('eq1', { captacao: 'f-cap' }, admin());
    assert.deepEqual(calls, []);
  });

  it('não devolve funis de equipe de outro tenant', async () => {
    const service = new EquipeFunisService({
      equipe: { findFirst: async () => null },
    } as never);
    await assert.rejects(
      () => service.getForEquipe('eq-other', admin()),
      NotFoundException,
    );
  });
});
