import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  ImovelChaveLocalizacao,
  ImovelChaveStatus,
  Role,
  UserStatus,
} from '@prisma/client';
import { ImovelChaveService } from './imovel-chave.service';
import type { AuthenticatedUser } from '../common/types/authenticated-user';

function user(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: 'u1',
    email: 'a@t.com',
    role: Role.admin,
    name: 'Carlos',
    tenantId: 't1',
    ...overrides,
  };
}

function chaveRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'k1',
    identificacao: 'Chave principal',
    quantidade: 2,
    quantidadeRetirada: 0,
    status: ImovelChaveStatus.disponivel,
    localizacaoAtual: ImovelChaveLocalizacao.imobiliaria,
    observacoes: '',
    createdAt: new Date(),
    updatedAt: new Date(),
    responsavelAtual: null,
    ...overrides,
  };
}

function txPrisma(partial: Record<string, unknown>) {
  const prisma: Record<string, unknown> = { ...partial };
  prisma.$transaction = async (fn: (tx: Record<string, unknown>) => unknown) =>
    fn(prisma);
  return prisma;
}

describe('ImovelChaveService', () => {
  it('cria chave no imóvel da venda', async () => {
    const created = chaveRow();
    const service = new ImovelChaveService(
      txPrisma({
        vendaUsado: { findFirst: async () => ({ id: 'v1', imovelId: 'i1' }) },
        imovelChave: { create: async () => created },
        imovelChaveMovimento: { create: async () => ({}) },
        vendaUsadoHistorico: { create: async () => ({}) },
      }) as never,
    );
    const result = await service.create(
      'v1',
      { identificacao: 'Chave principal', quantidade: 2 },
      user(),
    );
    assert.equal(result.identificacao, 'Chave principal');
    assert.equal(result.quantidade, 2);
  });

  it('lista chaves do imóvel da venda', async () => {
    const service = new ImovelChaveService({
      vendaUsado: { findFirst: async () => ({ id: 'v1', imovelId: 'i1' }) },
      imovelChave: { findMany: async () => [chaveRow()] },
    } as never);
    const rows = await service.list('v1', user());
    assert.equal(rows.length, 1);
  });

  it('edita identificação da chave', async () => {
    const service = new ImovelChaveService(
      txPrisma({
        vendaUsado: { findFirst: async () => ({ id: 'v1', imovelId: 'i1' }) },
        imovelChave: {
          findFirst: async () => chaveRow(),
          update: async () => chaveRow({ identificacao: 'Chave garagem' }),
        },
        imovelChaveMovimento: { create: async () => ({}) },
        vendaUsadoHistorico: { create: async () => ({}) },
      }) as never,
    );
    const result = await service.update(
      'v1',
      'k1',
      { identificacao: 'Chave garagem' },
      user(),
    );
    assert.equal(result.identificacao, 'Chave garagem');
  });

  it('retira quantidade e registra histórico', async () => {
    let movimentos = 0;
    const service = new ImovelChaveService(
      txPrisma({
        vendaUsado: { findFirst: async () => ({ id: 'v1', imovelId: 'i1' }) },
        user: { findFirst: async () => ({ id: 'u1', status: UserStatus.ativo }) },
        imovelChave: {
          findFirst: async () => chaveRow(),
          update: async () =>
            chaveRow({
              status: ImovelChaveStatus.retirada,
              quantidadeRetirada: 1,
              responsavelAtual: { id: 'u1', name: 'Carlos' },
            }),
        },
        imovelChaveMovimento: {
          create: async () => {
            movimentos += 1;
            return {};
          },
        },
        vendaUsadoHistorico: { create: async () => ({}) },
      }) as never,
    );
    const result = await service.retirar(
      'v1',
      'k1',
      { quantidade: 1, motivo: 'Visita ao imóvel' },
      user(),
    );
    assert.equal(result.status, ImovelChaveStatus.retirada);
    assert.equal(result.quantidadeRetirada, 1);
    assert.equal(movimentos, 1);
  });

  it('impede retirar mais do que o disponível', async () => {
    const service = new ImovelChaveService({
      vendaUsado: { findFirst: async () => ({ id: 'v1', imovelId: 'i1' }) },
      user: { findFirst: async () => ({ id: 'u1', status: UserStatus.ativo }) },
      imovelChave: { findFirst: async () => chaveRow({ quantidade: 1 }) },
    } as never);
    await assert.rejects(
      () => service.retirar('v1', 'k1', { quantidade: 2 }, user()),
      BadRequestException,
    );
  });

  it('devolve chave retirada', async () => {
    const service = new ImovelChaveService(
      txPrisma({
        vendaUsado: { findFirst: async () => ({ id: 'v1', imovelId: 'i1' }) },
        user: { findFirst: async () => ({ id: 'u1', status: UserStatus.ativo }) },
        imovelChave: {
          findFirst: async () =>
            chaveRow({
              status: ImovelChaveStatus.retirada,
              quantidadeRetirada: 1,
            }),
          update: async () =>
            chaveRow({
              status: ImovelChaveStatus.devolvida,
              quantidadeRetirada: 0,
            }),
        },
        imovelChaveMovimento: { create: async () => ({}) },
        vendaUsadoHistorico: { create: async () => ({}) },
      }) as never,
    );
    const result = await service.devolver('v1', 'k1', { quantidade: 1 }, user());
    assert.equal(result.status, ImovelChaveStatus.devolvida);
    assert.equal(result.quantidadeRetirada, 0);
  });

  it('marca como perdida e impede nova retirada', async () => {
    const service = new ImovelChaveService(
      txPrisma({
        vendaUsado: { findFirst: async () => ({ id: 'v1', imovelId: 'i1' }) },
        user: { findFirst: async () => ({ id: 'u1', status: UserStatus.ativo }) },
        imovelChave: {
          findFirst: async () =>
            chaveRow({ status: ImovelChaveStatus.perdida }),
          update: async () => chaveRow({ status: ImovelChaveStatus.perdida }),
        },
        imovelChaveMovimento: { create: async () => ({}) },
        vendaUsadoHistorico: { create: async () => ({}) },
      }) as never,
    );
    await assert.rejects(
      () => service.retirar('v1', 'k1', { quantidade: 1 }, user()),
      BadRequestException,
    );
  });

  it('recusa responsável de outro tenant', async () => {
    const service = new ImovelChaveService({
      vendaUsado: { findFirst: async () => ({ id: 'v1', imovelId: 'i1' }) },
      imovelChave: { findFirst: async () => chaveRow() },
      user: { findFirst: async () => null },
    } as never);
    await assert.rejects(
      () =>
        service.retirar('v1', 'k1', { quantidade: 1, responsavelId: 'u-b' }, user()),
      BadRequestException,
    );
  });

  it('não devolve chave de outro tenant', async () => {
    const service = new ImovelChaveService({
      vendaUsado: { findFirst: async () => null },
    } as never);
    await assert.rejects(() => service.list('v-b', user()), NotFoundException);
  });

  it('não movimenta chave de outro imóvel', async () => {
    const service = new ImovelChaveService({
      vendaUsado: { findFirst: async () => ({ id: 'v1', imovelId: 'i1' }) },
      imovelChave: { findFirst: async () => null },
    } as never);
    await assert.rejects(
      () => service.historico('v1', 'k-b', user()),
      NotFoundException,
    );
  });
});
