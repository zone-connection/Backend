import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  MuralChaveLocal,
  MuralChaveMovimentoTipo,
  MuralChaveStatus,
  Role,
} from '@prisma/client';
import { MuralChavesService } from './mural-chaves.service';
import type { AuthenticatedUser } from '../common/types/authenticated-user';

function user(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: 'u1',
    email: 'a@t.com',
    role: Role.admin,
    name: 'Marina',
    tenantId: 't1',
    ...overrides,
  };
}

function chave(overrides: Record<string, unknown> = {}) {
  return {
    id: 'k1',
    tenantId: 't1',
    identificador: 'TORRE-A-304',
    identificadorNorm: 'TORRE-A-304',
    imovelId: 'i1',
    empreendimentoId: 'e1',
    unidade: 'Apartamento 304',
    status: MuralChaveStatus.disponivel,
    local: MuralChaveLocal.imobiliaria,
    localDescricao: '',
    observacoes: '',
    retiradaEm: null,
    previsaoDevolucao: null,
    createdAt: new Date('2026-09-24T17:30:00.000Z'),
    updatedAt: new Date('2026-09-24T17:30:00.000Z'),
    empreendimento: { id: 'e1', nome: 'Residencial X' },
    imovel: {
      id: 'i1',
      tipo: 'apartamento',
      logradouro: 'Rua A',
      numero: '10',
      complemento: '',
      bairro: 'Centro',
      cidade: 'São Paulo',
    },
    responsavelAtual: null,
    retiradoPor: null,
    retiradaRegistradaPor: null,
    ...overrides,
  };
}

function txPrisma(partial: Record<string, unknown>) {
  const prisma: Record<string, any> = { ...partial };
  prisma.$transaction = async (fn: (tx: Record<string, unknown>) => unknown) =>
    fn(prisma);
  return prisma;
}

const vinculo = {
  imovel: {
    findFirst: async () => chave().imovel,
  },
  empreendimento: {
    findFirst: async () => ({ id: 'e1', nome: 'Residencial X' }),
  },
};

describe('MuralChavesService', () => {
  it('cadastra a chave com o identificador da imobiliária', async () => {
    const saved: { identificador: string; identificadorNorm: string } = {
      identificador: '',
      identificadorNorm: '',
    };
    const service = new MuralChavesService(
      txPrisma({
        ...vinculo,
        muralChave: {
          create: async (args: {
            data: { identificador: string; identificadorNorm: string };
          }) => {
            saved.identificador = args.data.identificador;
            saved.identificadorNorm = args.data.identificadorNorm;
            return chave({ identificador: args.data.identificador });
          },
        },
        muralChaveMovimento: { create: async () => ({}) },
      }) as never,
    );
    const result = await service.create(
      {
        identificador: '  torre-a-304 ',
        imovelId: 'i1',
        empreendimentoId: 'e1',
        unidade: 'Apartamento 304',
      },
      user(),
    );
    assert.equal(saved.identificador, 'torre-a-304');
    assert.equal(saved.identificadorNorm, 'TORRE-A-304');
    assert.equal(result.identificador, 'torre-a-304');
    assert.equal(result.imovelLabel, 'Apartamento 304');
    assert.equal(result.empreendimento?.nome, 'Residencial X');
    assert.equal(result.statusLabel, 'Disponível');
  });

  it('alterar o identificador preserva o id e grava o código anterior', async () => {
    const movimentos: Array<Record<string, unknown>> = [];
    let updatedId = '';
    const service = new MuralChavesService(
      txPrisma({
        ...vinculo,
        muralChave: {
          findFirst: async () => chave(),
          update: async (args: { where: { id: string }; data: { identificador: string } }) => {
            updatedId = args.where.id;
            return chave({ identificador: args.data.identificador });
          },
        },
        muralChaveMovimento: {
          create: async (args: { data: Record<string, unknown> }) => {
            movimentos.push(args.data);
          },
        },
      }) as never,
    );
    const result = await service.update(
      'k1',
      { identificador: 'CHV 09' },
      user(),
    );
    assert.equal(updatedId, 'k1');
    assert.equal(result.id, 'k1');
    assert.equal(result.identificador, 'CHV 09');
    assert.equal(movimentos.length, 1);
    assert.equal(movimentos[0].tipo, MuralChaveMovimentoTipo.identificador);
    assert.equal(movimentos[0].identificadorAnterior, 'TORRE-A-304');
    assert.equal(movimentos[0].chaveId, 'k1');
  });

  it('gerente não altera o identificador', async () => {
    const service = new MuralChavesService(
      txPrisma({
        muralChave: { findFirst: async () => chave() },
      }) as never,
    );
    await assert.rejects(
      () =>
        service.update(
          'k1',
          { identificador: 'CH-009' },
          user({ role: Role.gerente, id: 'g1', name: 'Gerente' }),
        ),
      ForbiddenException,
    );
  });

  it('corretor retira a chave e ela deixa de ficar disponível', async () => {
    let status = '';
    const service = new MuralChavesService(
      txPrisma({
        muralChave: {
          findFirst: async () => chave(),
          update: async (args: { data: { status: string; retiradoPorId: string } }) => {
            status = args.data.status;
            return chave({
              status: MuralChaveStatus.em_uso,
              local: MuralChaveLocal.corretor,
              retiradoPor: { id: args.data.retiradoPorId, name: 'João' },
              retiradaRegistradaPor: { id: 'c1', name: 'João' },
              retiradaEm: new Date('2026-09-24T17:30:00.000Z'),
            });
          },
        },
        muralChaveMovimento: { create: async () => ({}) },
        user: { findMany: async () => [{ id: 'u1', role: Role.admin, permissions: null }] },
        notificacao: { createMany: async () => ({ count: 1 }) },
      }) as never,
    );
    const result = await service.retirar(
      'k1',
      {},
      user({ id: 'c1', role: Role.corretor, name: 'João' }),
    );
    assert.equal(status, MuralChaveStatus.em_uso);
    assert.equal(result.statusLabel, 'Em uso');
    assert.equal(result.comQuem, 'Corretor João');
  });

  it('não retira uma chave que já está em uso', async () => {
    const service = new MuralChavesService(
      txPrisma({
        muralChave: {
          findFirst: async () =>
            chave({
              status: MuralChaveStatus.em_uso,
              retiradoPor: { id: 'c1', name: 'João' },
            }),
        },
      }) as never,
    );
    await assert.rejects(
      () => service.retirar('k1', {}, user({ role: Role.corretor, name: 'Ana' })),
      (err: unknown) => {
        assert.ok(err instanceof BadRequestException);
        assert.match(err.message, /João/);
        return true;
      },
    );
  });

  it('analista não registra retirada', async () => {
    const service = new MuralChavesService(txPrisma({}) as never);
    await assert.rejects(
      () => service.retirar('k1', {}, user({ role: Role.analista, name: 'Ana' })),
      ForbiddenException,
    );
  });

  it('devolução libera a chave e deixa confirmação pendente para o corretor', async () => {
    const movimentos: Array<Record<string, unknown>> = [];
    const avisos: Array<Record<string, unknown>> = [];
    const service = new MuralChavesService(
      txPrisma({
        muralChave: {
          findFirst: async () =>
            chave({
              status: MuralChaveStatus.em_uso,
              local: MuralChaveLocal.corretor,
              retiradoPor: { id: 'c1', name: 'João' },
              retiradaEm: new Date('2026-09-24T17:30:00.000Z'),
            }),
          update: async () =>
            chave({
              status: MuralChaveStatus.disponivel,
              local: MuralChaveLocal.imobiliaria,
              responsavelAtual: { id: 'u1', name: 'Marina' },
            }),
        },
        muralChaveMovimento: {
          create: async (args: { data: Record<string, unknown> }) => {
            movimentos.push(args.data);
          },
        },
        user: {
          findMany: async () => [{ id: 'u1', role: Role.admin, permissions: null }],
        },
        notificacao: {
          create: async (args: { data: Record<string, unknown> }) => {
            avisos.push(args.data);
          },
          createMany: async (args: { data: Array<Record<string, unknown>> }) => {
            avisos.push(...args.data);
          },
        },
      }) as never,
    );
    const result = await service.devolver(
      'k1',
      { local: MuralChaveLocal.imobiliaria },
      user(),
    );
    assert.equal(result.status, MuralChaveStatus.disponivel);
    assert.equal(result.comQuem, 'Imobiliária (Marina)');
    assert.equal(movimentos[0].tipo, MuralChaveMovimentoTipo.devolucao);
    assert.equal(movimentos[0].confirmacaoPendente, true);
    assert.equal(movimentos[0].quemDevolveuId, 'c1');
    assert.equal(movimentos[0].quemRecebeuDevolucaoId, 'u1');
    assert.equal(movimentos[0].manual, true);
    assert.ok(avisos.some((item) => item.userId === 'c1'));
  });

  it('corretor confirma para quem entregou a chave', async () => {
    let pendente = true;
    const tipos: string[] = [];
    const service = new MuralChavesService(
      txPrisma({
        muralChaveMovimento: {
          findFirst: async () => ({
            id: 'm1',
            chaveId: 'k1',
            devolucaoEm: new Date(),
          }),
          update: async (args: { data: { confirmacaoPendente: boolean; confirmadoParaNome: string } }) => {
            pendente = args.data.confirmacaoPendente;
            assert.equal(args.data.confirmadoParaNome, 'Marina');
          },
          create: async (args: { data: { tipo: string; confirmadoParaNome: string } }) => {
            tipos.push(args.data.tipo);
            assert.equal(args.data.confirmadoParaNome, 'Marina');
          },
        },
        user: { findFirst: async () => ({ id: 'u1', name: 'Marina' }) },
        muralChave: { findFirst: async () => chave() },
      }) as never,
    );
    const result = await service.confirmar(
      'm1',
      { entregueParaId: 'u1' },
      user({ id: 'c1', role: Role.corretor, name: 'João' }),
    );
    assert.equal(result.ok, true);
    assert.equal(pendente, false);
    assert.deepEqual(tipos, [MuralChaveMovimentoTipo.confirmacao]);
  });

  it('responsável registra a retirada quando o corretor não fez no sistema', async () => {
    const movimentos: Array<Record<string, unknown>> = [];
    const service = new MuralChavesService(
      txPrisma({
        muralChave: {
          findFirst: async () => chave(),
          update: async () =>
            chave({
              status: MuralChaveStatus.em_uso,
              retiradoPor: { id: 'c1', name: 'João' },
              retiradaRegistradaPor: { id: 'u1', name: 'Marina' },
            }),
        },
        user: {
          findFirst: async () => ({ id: 'c1', name: 'João' }),
          findMany: async () => [{ id: 'u1', role: Role.admin, permissions: null }],
        },
        muralChaveMovimento: {
          create: async (args: { data: Record<string, unknown> }) => {
            movimentos.push(args.data);
          },
        },
        notificacao: { createMany: async () => ({ count: 1 }) },
      }) as never,
    );
    const result = await service.retiradaManual(
      'k1',
      { corretorId: 'c1', retiradaEm: '2026-09-24T17:30:00.000Z' },
      user(),
    );
    assert.equal(result.comQuem, 'Corretor João');
    assert.equal(movimentos[0].tipo, MuralChaveMovimentoTipo.retirada_manual);
    assert.equal(movimentos[0].manual, true);
    assert.equal(movimentos[0].quemRetirouId, 'c1');
    assert.equal(movimentos[0].autorId, 'u1');
  });
});
