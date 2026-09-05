import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  Role,
  UserStatus,
  VendaUsadoFechamentoStatus,
  VendaUsadoPosVendaPendenciaStatus,
  VendaUsadoPosVendaStatus,
  VendaUsadoStatus,
} from '@prisma/client';
import { VendaUsadoPosVendaService } from './venda-usado-pos-venda.service';
import type { AuthenticatedUser } from '../common/types/authenticated-user';

function user(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: 'u1',
    email: 'a@t.com',
    role: Role.admin,
    name: 'Maria',
    tenantId: 't1',
    ...overrides,
  };
}

function posRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pv1',
    status: VendaUsadoPosVendaStatus.pendente,
    observacoes: '',
    concluidoAt: null,
    canceladoAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    interessado: { id: 'n1', nome: 'João' },
    proprietario: { id: 'pr1', nome: 'Ana' },
    responsavel: { id: 'u1', name: 'Maria' },
    pendencias: [],
    ...overrides,
  };
}

function txPrisma(partial: Record<string, unknown>) {
  const prisma: Record<string, unknown> = { ...partial };
  prisma.$transaction = async (fn: (tx: Record<string, unknown>) => unknown) =>
    fn(prisma);
  return prisma;
}

describe('VendaUsadoPosVendaService', () => {
  it('inicia pós-venda de venda concluída', async () => {
    const created = posRow({
      pendencias: [
        {
          id: 'p1',
          titulo: 'Confirmar entrega das chaves',
          descricao: '',
          status: VendaUsadoPosVendaPendenciaStatus.pendente,
          obrigatoria: true,
          prazo: null,
          concluidaEm: null,
          observacao: '',
          createdAt: new Date(),
          updatedAt: new Date(),
          responsavel: null,
        },
      ],
    });
    const service = new VendaUsadoPosVendaService(
      txPrisma({
        vendaUsado: {
          findFirst: async () => ({
            id: 'v1',
            status: VendaUsadoStatus.vendido,
            imovelId: 'i1',
          }),
        },
        vendaUsadoFechamento: {
          findFirst: async () => ({
            id: 'f1',
            interessadoId: 'n1',
            status: VendaUsadoFechamentoStatus.concluido,
          }),
        },
        vendaUsadoPosVenda: {
          findFirst: async () => null,
          create: async () => ({ id: 'pv1' }),
          findFirstOrThrow: async () => created,
        },
        imovel: { findFirst: async () => ({ proprietarioId: 'pr1' }) },
        user: { findFirst: async () => ({ id: 'u1', status: UserStatus.ativo }) },
        vendaUsadoPosVendaPendencia: { createMany: async () => ({ count: 4 }) },
        vendaUsadoHistorico: { create: async () => ({}) },
      }) as never,
    );
    const result = await service.iniciar('v1', {}, user());
    assert.equal(result.status, VendaUsadoPosVendaStatus.pendente);
    assert.equal(result.interessado.nome, 'João');
  });

  it('impede pós-venda de venda não concluída', async () => {
    const service = new VendaUsadoPosVendaService({
      vendaUsado: {
        findFirst: async () => ({
          id: 'v1',
          status: VendaUsadoStatus.disponivel,
          imovelId: 'i1',
        }),
      },
    } as never);
    await assert.rejects(() => service.iniciar('v1', {}, user()), BadRequestException);
  });

  it('cria pendência personalizada', async () => {
    const service = new VendaUsadoPosVendaService(
      txPrisma({
        vendaUsado: {
          findFirst: async () => ({
            id: 'v1',
            status: VendaUsadoStatus.vendido,
            imovelId: 'i1',
          }),
        },
        vendaUsadoPosVenda: {
          findFirst: async () => ({
            id: 'pv1',
            status: VendaUsadoPosVendaStatus.pendente,
            responsavelId: 'u1',
          }),
          update: async () => ({}),
        },
        vendaUsadoPosVendaPendencia: {
          create: async () => ({
            id: 'pd1',
            titulo: 'Outra pendência',
            descricao: '',
            status: VendaUsadoPosVendaPendenciaStatus.pendente,
            obrigatoria: false,
            prazo: null,
            concluidaEm: null,
            observacao: '',
            createdAt: new Date(),
            updatedAt: new Date(),
            responsavel: null,
          }),
        },
        vendaUsadoHistorico: { create: async () => ({}) },
      }) as never,
    );
    const result = await service.createPendencia(
      'v1',
      { titulo: 'Outra pendência' },
      user(),
    );
    assert.equal(result.titulo, 'Outra pendência');
  });

  it('conclui e cancela pendência', async () => {
    const pend: {
      id: string;
      titulo: string;
      status: VendaUsadoPosVendaPendenciaStatus;
    } = {
      id: 'pd1',
      titulo: 'Orientar',
      status: VendaUsadoPosVendaPendenciaStatus.pendente,
    };
    const service = new VendaUsadoPosVendaService(
      txPrisma({
        vendaUsado: {
          findFirst: async () => ({
            id: 'v1',
            status: VendaUsadoStatus.vendido,
            imovelId: 'i1',
          }),
        },
        vendaUsadoPosVenda: {
          findFirst: async () => ({
            id: 'pv1',
            status: VendaUsadoPosVendaStatus.em_andamento,
            responsavelId: 'u1',
          }),
          update: async () => ({}),
        },
        vendaUsadoPosVendaPendencia: {
          findFirst: async () => pend,
          findMany: async () => [],
          update: async (args: {
            data: { status: VendaUsadoPosVendaPendenciaStatus };
          }) => ({
            id: 'pd1',
            titulo: 'Orientar',
            descricao: '',
            status: args.data.status,
            obrigatoria: true,
            prazo: null,
            concluidaEm: new Date(),
            observacao: '',
            createdAt: new Date(),
            updatedAt: new Date(),
            responsavel: null,
          }),
        },
        vendaUsadoHistorico: { create: async () => ({}) },
      }) as never,
    );
    const done = await service.updatePendencia(
      'v1',
      'pd1',
      { status: VendaUsadoPosVendaPendenciaStatus.concluida },
      user(),
    );
    assert.equal(done.status, VendaUsadoPosVendaPendenciaStatus.concluida);
    pend.status = VendaUsadoPosVendaPendenciaStatus.concluida;
    const canceled = await service.updatePendencia(
      'v1',
      'pd1',
      { status: VendaUsadoPosVendaPendenciaStatus.cancelada },
      user(),
    );
    assert.equal(canceled.status, VendaUsadoPosVendaPendenciaStatus.cancelada);
  });

  it('impede responsável de outro tenant', async () => {
    const service = new VendaUsadoPosVendaService({
      vendaUsado: {
        findFirst: async () => ({
          id: 'v1',
          status: VendaUsadoStatus.vendido,
          imovelId: 'i1',
        }),
      },
      vendaUsadoPosVenda: {
        findFirst: async () => ({
          id: 'pv1',
          status: VendaUsadoPosVendaStatus.pendente,
          responsavelId: 'u1',
        }),
      },
      user: { findFirst: async () => null },
    } as never);
    await assert.rejects(
      () => service.update('v1', { responsavelId: 'u-b' }, user()),
      BadRequestException,
    );
  });

  it('impede conclusão com pendência obrigatória aberta', async () => {
    const service = new VendaUsadoPosVendaService({
      vendaUsado: {
        findFirst: async () => ({
          id: 'v1',
          status: VendaUsadoStatus.vendido,
          imovelId: 'i1',
        }),
      },
      vendaUsadoPosVenda: {
        findFirst: async () => ({
          id: 'pv1',
          status: VendaUsadoPosVendaStatus.em_andamento,
        }),
      },
      vendaUsadoPosVendaPendencia: {
        findMany: async () => [
          {
            obrigatoria: true,
            status: VendaUsadoPosVendaPendenciaStatus.pendente,
          },
        ],
      },
    } as never);
    await assert.rejects(() => service.concluir('v1', user()), BadRequestException);
  });

  it('conclui pós-venda e registra histórico', async () => {
    let historico = 0;
    const done = posRow({ status: VendaUsadoPosVendaStatus.concluido });
    const service = new VendaUsadoPosVendaService(
      txPrisma({
        vendaUsado: {
          findFirst: async () => ({
            id: 'v1',
            status: VendaUsadoStatus.vendido,
            imovelId: 'i1',
          }),
        },
        vendaUsadoPosVenda: {
          findFirst: async (args?: { include?: unknown }) =>
            args?.include
              ? done
              : { id: 'pv1', status: VendaUsadoPosVendaStatus.em_andamento },
          update: async () => ({}),
        },
        vendaUsadoPosVendaPendencia: {
          findMany: async () => [
            {
              obrigatoria: true,
              status: VendaUsadoPosVendaPendenciaStatus.concluida,
            },
          ],
        },
        vendaUsadoHistorico: {
          create: async () => {
            historico += 1;
            return {};
          },
        },
      }) as never,
    );
    const result = await service.concluir('v1', user());
    assert.equal(result.status, VendaUsadoPosVendaStatus.concluido);
    assert.ok(historico >= 1);
  });

  it('não devolve pós-venda de outro tenant', async () => {
    const service = new VendaUsadoPosVendaService({
      vendaUsado: { findFirst: async () => null },
    } as never);
    await assert.rejects(() => service.get('v-b', user()), NotFoundException);
  });
});
