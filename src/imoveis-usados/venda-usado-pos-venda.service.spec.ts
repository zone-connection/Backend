import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  FunilEtapaPapel,
  FunilTipo,
  Role,
  UserStatus,
  VendaUsadoFechamentoStatus,
  VendaUsadoPosVendaPendenciaStatus,
  VendaUsadoPosVendaStatus,
  VendaUsadoStatus,
} from '@prisma/client';
import { VendaUsadoPosVendaService } from './venda-usado-pos-venda.service';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import type { FunilResolverService } from '../funis/funil-resolver.service';

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

function mockFunilResolver(): FunilResolverService {
  return {
    resolve: async () => ({
      id: 'funil-pv',
      name: 'Funil de Pós-venda',
      tipo: FunilTipo.pos_venda,
      ativo: true,
      etapas: [
        {
          id: 'et1',
          label: 'Entrada',
          slug: 'entrada-pos-venda',
          sortOrder: 0,
          active: true,
          papel: FunilEtapaPapel.inicial,
          prazoValor: null,
          prazoUnidade: 'horas',
          alertaAntecedenciaPercent: 20,
        },
      ],
    }),
  } as never;
}

function posRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pv1',
    vendaUsadoId: 'v1',
    status: VendaUsadoPosVendaStatus.pendente,
    observacoes: '',
    concluidoAt: null,
    canceladoAt: null,
    encaminhadoEm: new Date(),
    funilId: 'funil-pv',
    funilEtapaId: 'et1',
    createdAt: new Date(),
    updatedAt: new Date(),
    interessado: { id: 'n1', nome: 'João', telefone: null, email: null },
    proprietario: { id: 'pr1', nome: 'Ana' },
    responsavel: { id: 'u1', name: 'Maria' },
    encaminhadoPor: { id: 'u1', name: 'Maria' },
    funil: { id: 'funil-pv', name: 'Funil de Pós-venda', tipo: 'pos_venda' },
    funilEtapa: {
      id: 'et1',
      label: 'Entrada',
      slug: 'entrada-pos-venda',
      color: 'bg-slate-200',
      papel: 'inicial',
    },
    vendaUsado: null,
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
  it('encaminha pós-venda de venda concluída', async () => {
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
            responsavelId: 'u1',
          }),
          update: async () => ({}),
        },
        vendaUsadoFechamento: {
          findFirst: async () => ({
            id: 'f1',
            interessadoId: 'n1',
            responsavelId: 'u1',
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
      mockFunilResolver(),
    );
    const result = await service.encaminhar('v1', {}, user());
    assert.equal(result.status, VendaUsadoPosVendaStatus.pendente);
    assert.equal(result.lead.nome, 'João');
    assert.equal(result.funilEtapaId, 'et1');
  });

  it('impede encaminhamento por corretor', async () => {
    const service = new VendaUsadoPosVendaService(
      {} as never,
      mockFunilResolver(),
    );
    await assert.rejects(
      () => service.encaminhar('v1', {}, user({ role: Role.corretor })),
      ForbiddenException,
    );
  });

  it('impede pós-venda de venda não concluída', async () => {
    const service = new VendaUsadoPosVendaService(
      {
        vendaUsado: {
          findFirst: async () => ({
            id: 'v1',
            status: VendaUsadoStatus.disponivel,
            imovelId: 'i1',
            responsavelId: 'u1',
          }),
        },
      } as never,
      mockFunilResolver(),
    );
    await assert.rejects(
      () => service.iniciar('v1', {}, user()),
      BadRequestException,
    );
  });

  it('cria pendência personalizada', async () => {
    const service = new VendaUsadoPosVendaService(
      txPrisma({
        vendaUsado: {
          findFirst: async () => ({
            id: 'v1',
            status: VendaUsadoStatus.vendido,
            imovelId: 'i1',
            responsavelId: 'u1',
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
      mockFunilResolver(),
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
            responsavelId: 'u1',
          }),
        },
        vendaUsadoPosVenda: {
          findFirst: async () => ({
            id: 'pv1',
            status: VendaUsadoPosVendaStatus.em_andamento,
            responsavelId: 'u1',
          }),
        },
        vendaUsadoPosVendaPendencia: {
          findFirst: async () => pend,
          findMany: async () => [
            {
              ...pend,
              status: VendaUsadoPosVendaPendenciaStatus.concluida,
              prazo: null,
            },
          ],
          update: async (args: {
            data: { status: VendaUsadoPosVendaPendenciaStatus };
          }) => {
            pend.status = args.data.status;
            return {
              id: pend.id,
              titulo: pend.titulo,
              descricao: '',
              status: pend.status,
              obrigatoria: true,
              prazo: null,
              concluidaEm: new Date(),
              observacao: '',
              createdAt: new Date(),
              updatedAt: new Date(),
              responsavel: null,
            };
          },
        },
        vendaUsadoHistorico: { create: async () => ({}) },
      }) as never,
      mockFunilResolver(),
    );
    const result = await service.updatePendencia(
      'v1',
      'pd1',
      { status: VendaUsadoPosVendaPendenciaStatus.concluida },
      user(),
    );
    assert.equal(result.status, VendaUsadoPosVendaPendenciaStatus.concluida);
  });

  it('recusa encaminhamento', async () => {
    const service = new VendaUsadoPosVendaService(
      txPrisma({
        vendaUsado: {
          findFirst: async () => ({
            id: 'v1',
            status: VendaUsadoStatus.vendido,
            imovelId: 'i1',
            responsavelId: 'u1',
          }),
          update: async () => ({}),
        },
        vendaUsadoPosVenda: { findFirst: async () => null },
        vendaUsadoHistorico: { create: async () => ({}) },
      }) as never,
      mockFunilResolver(),
    );
    const result = await service.recusar('v1', user());
    assert.equal(result.recusado, true);
  });

  it('404 quando pós-venda não existe', async () => {
    const service = new VendaUsadoPosVendaService(
      {
        vendaUsado: {
          findFirst: async () => ({
            id: 'v1',
            status: VendaUsadoStatus.vendido,
            imovelId: 'i1',
            responsavelId: 'u1',
          }),
        },
        vendaUsadoPosVenda: { findFirst: async () => null },
      } as never,
      mockFunilResolver(),
    );
    await assert.rejects(() => service.get('v1', user()), NotFoundException);
  });
});
