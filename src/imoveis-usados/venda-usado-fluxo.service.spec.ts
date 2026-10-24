import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  Role,
  VendaUsadoNegociacaoStatus,
  VendaUsadoPropostaStatus,
  VendaUsadoStatus,
  VendaUsadoVisitaStatus,
} from '@prisma/client';
import { VendaUsadoFluxoService } from './venda-usado-fluxo.service';
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

describe('VendaUsadoFluxoService — visitas', () => {
  it('não devolve visita de outro tenant', async () => {
    const service = new VendaUsadoFluxoService({
      vendaUsado: { findFirst: async () => null },
    } as never);
    await assert.rejects(
      () => service.listVisitas('v-b', user()),
      NotFoundException,
    );
  });

  it('recusa visita em imóvel vendido', async () => {
    const service = new VendaUsadoFluxoService({
      vendaUsado: {
        findFirst: async () => ({ id: 'v1', status: VendaUsadoStatus.vendido }),
      },
    } as never);
    await assert.rejects(
      () =>
        service.createVisita(
          'v1',
          {
            interessadoId: 'n1',
            responsavelId: 'u1',
            dataHora: new Date().toISOString(),
          },
          user(),
        ),
      BadRequestException,
    );
  });

  it('recusa interessado de outro tenant na visita', async () => {
    const service = new VendaUsadoFluxoService({
      vendaUsado: {
        findFirst: async () => ({
          id: 'v1',
          status: VendaUsadoStatus.disponivel,
        }),
      },
      interessadoUsado: { findFirst: async () => null },
    } as never);
    await assert.rejects(
      () =>
        service.createVisita(
          'v1',
          {
            interessadoId: 'n-b',
            responsavelId: 'u1',
            dataHora: new Date().toISOString(),
          },
          user(),
        ),
      BadRequestException,
    );
  });

  it('recusa responsável de outro tenant na visita', async () => {
    const service = new VendaUsadoFluxoService({
      vendaUsado: {
        findFirst: async () => ({
          id: 'v1',
          status: VendaUsadoStatus.disponivel,
        }),
      },
      interessadoUsado: { findFirst: async () => ({ id: 'n1', nome: 'João' }) },
      user: { findFirst: async () => null },
    } as never);
    await assert.rejects(
      () =>
        service.createVisita(
          'v1',
          {
            interessadoId: 'n1',
            responsavelId: 'u-b',
            dataHora: new Date().toISOString(),
          },
          user(),
        ),
      BadRequestException,
    );
  });

  it('não reabre visita realizada', async () => {
    const service = new VendaUsadoFluxoService({
      vendaUsado: {
        findFirst: async () => ({
          id: 'v1',
          status: VendaUsadoStatus.disponivel,
        }),
      },
      vendaUsadoVisita: {
        findFirst: async () => ({
          id: 'vis1',
          status: VendaUsadoVisitaStatus.realizada,
          dataHora: new Date(),
          interessado: { id: 'n1', nome: 'João', telefone: '' },
          responsavel: { id: 'u1', name: 'Maria' },
        }),
      },
    } as never);
    await assert.rejects(
      () =>
        service.updateVisita(
          'v1',
          'vis1',
          { status: VendaUsadoVisitaStatus.agendada },
          user(),
        ),
      BadRequestException,
    );
  });
});

describe('VendaUsadoFluxoService — propostas', () => {
  it('não devolve proposta de outro tenant', async () => {
    const service = new VendaUsadoFluxoService({
      vendaUsado: {
        findFirst: async () => ({
          id: 'v1',
          status: VendaUsadoStatus.disponivel,
        }),
      },
      vendaUsadoProposta: { findFirst: async () => null },
    } as never);
    await assert.rejects(
      () => service.getProposta('v1', 'p-b', user()),
      NotFoundException,
    );
  });

  it('recusa proposta com valor zero', async () => {
    const service = new VendaUsadoFluxoService({
      vendaUsado: {
        findFirst: async () => ({
          id: 'v1',
          status: VendaUsadoStatus.disponivel,
        }),
      },
    } as never);
    await assert.rejects(
      () =>
        service.createProposta(
          'v1',
          { interessadoId: 'n1', responsavelId: 'u1', valor: 0 },
          user(),
        ),
      BadRequestException,
    );
  });

  it('recusa proposta de interessado de outro tenant', async () => {
    const service = new VendaUsadoFluxoService({
      vendaUsado: {
        findFirst: async () => ({
          id: 'v1',
          status: VendaUsadoStatus.disponivel,
        }),
      },
      interessadoUsado: { findFirst: async () => null },
    } as never);
    await assert.rejects(
      () =>
        service.createProposta(
          'v1',
          { interessadoId: 'n-b', responsavelId: 'u1', valor: 470000 },
          user(),
        ),
      BadRequestException,
    );
  });

  it('recusa proposta em imóvel indisponível', async () => {
    const service = new VendaUsadoFluxoService({
      vendaUsado: {
        findFirst: async () => ({
          id: 'v1',
          status: VendaUsadoStatus.indisponivel,
        }),
      },
    } as never);
    await assert.rejects(
      () =>
        service.createProposta(
          'v1',
          { interessadoId: 'n1', responsavelId: 'u1', valor: 100 },
          user(),
        ),
      BadRequestException,
    );
  });
});

describe('VendaUsadoFluxoService — negociação', () => {
  it('recusa contraproposta em negociação encerrada', async () => {
    const service = new VendaUsadoFluxoService({
      vendaUsadoProposta: {
        findFirst: async () => ({
          id: 'p1',
          valor: 470000,
          status: VendaUsadoPropostaStatus.enviada,
          interessado: { nome: 'João' },
          negociacao: {
            id: 'neg1',
            status: VendaUsadoNegociacaoStatus.encerrada,
            movimentos: [{ valor: 470000 }],
          },
        }),
      },
    } as never);
    await assert.rejects(
      () => service.addMovimento('v1', 'p1', { valor: 490000 }, user()),
      BadRequestException,
    );
  });

  it('não altera proposta de outro tenant na contraproposta', async () => {
    const service = new VendaUsadoFluxoService({
      vendaUsadoProposta: { findFirst: async () => null },
    } as never);
    await assert.rejects(
      () => service.addMovimento('v1', 'p-b', { valor: 480000 }, user()),
      NotFoundException,
    );
  });
});
