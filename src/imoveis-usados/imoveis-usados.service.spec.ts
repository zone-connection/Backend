import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { CaptacaoImovelTipo, FunilTipo, Role } from '@prisma/client';
import { ImoveisUsadosService } from './imoveis-usados.service';
import type { AuthenticatedUser } from '../common/types/authenticated-user';

function user(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: 'u1',
    email: 'a@t.com',
    role: Role.admin,
    name: 'Eduardo',
    tenantId: 't1',
    ...overrides,
  };
}

describe('ImoveisUsadosService', () => {
  it('não devolve venda de outro tenant', async () => {
    const service = new ImoveisUsadosService({
      vendaUsado: { findFirst: async () => null },
    } as never);
    await assert.rejects(() => service.get('x', user()), NotFoundException);
  });

  it('não devolve interessado de outro tenant', async () => {
    const service = new ImoveisUsadosService({
      interessadoUsado: { findFirst: async () => null },
    } as never);
    await assert.rejects(
      () => service.getInteressado('x', user()),
      NotFoundException,
    );
  });

  it('recusa imóvel sem captação', async () => {
    const service = new ImoveisUsadosService({
      imovel: {
        findFirst: async () => ({
          id: 'i1',
          tenantId: 't1',
          captacoes: [],
          vendaUsado: null,
        }),
      },
    } as never);
    await assert.rejects(
      () =>
        service.create(
          { imovelId: 'i1', responsavelId: 'u1' },
          user(),
        ),
      (err: unknown) => {
        assert.ok(err instanceof BadRequestException);
        assert.match((err as Error).message, /captação/);
        return true;
      },
    );
  });

  it('recusa imóvel de outro tenant na disponibilização', async () => {
    const service = new ImoveisUsadosService({
      imovel: { findFirst: async () => null },
    } as never);
    await assert.rejects(
      () =>
        service.create({ imovelId: 'i-b', responsavelId: 'u1' }, user()),
      BadRequestException,
    );
  });

  it('recusa funil comercial', async () => {
    const service = new ImoveisUsadosService({
      imovel: {
        findFirst: async () => ({
          id: 'i1',
          tenantId: 't1',
          captacoes: [{ valorPretendido: 100 }],
          vendaUsado: null,
        }),
      },
      user: { findFirst: async () => ({ id: 'u1' }) },
      funil: {
        findFirst: async () => ({
          id: 'f',
          tipo: FunilTipo.comercial,
          etapas: [{ id: 'e', sortOrder: 0, active: true }],
        }),
      },
    } as never);
    await assert.rejects(
      () =>
        service.create(
          { imovelId: 'i1', responsavelId: 'u1', funilId: 'f' },
          user(),
        ),
      (err: unknown) => {
        assert.ok(err instanceof BadRequestException);
        assert.match((err as Error).message, /Venda de usados/);
        return true;
      },
    );
  });

  it('recusa responsável de outro tenant', async () => {
    const service = new ImoveisUsadosService({
      imovel: {
        findFirst: async () => ({
          id: 'i1',
          captacoes: [{ valorAvaliacao: 200 }],
          vendaUsado: null,
        }),
      },
      user: { findFirst: async () => null },
    } as never);
    await assert.rejects(
      () =>
        service.create({ imovelId: 'i1', responsavelId: 'u-other' }, user()),
      BadRequestException,
    );
  });

  it('impede vínculo duplicado', async () => {
    const service = new ImoveisUsadosService({
      vendaUsado: {
        findFirst: async () => ({
          id: 'v1',
          tenantId: 't1',
          precoVenda: 100,
          imovel: {
            tipo: CaptacaoImovelTipo.casa,
            logradouro: 'Rua',
            numero: '1',
            bairro: 'Centro',
            cidade: 'Recife',
            area: 80,
            areaConstruida: null,
            proprietario: { id: 'p', nome: 'A', telefone: '' },
          },
          responsavel: { id: 'u1', name: 'E', email: '' },
          funil: { id: 'f', name: 'VU', tipo: FunilTipo.venda_usados },
          funilEtapa: { id: 'e', label: 'Novo', slug: '', color: '', papel: null },
          _count: { vinculos: 1 },
          vinculos: [],
          historicos: [],
        }),
      },
      interessadoUsado: { findFirst: async () => ({ id: 'n1', nome: 'João' }) },
      vendaUsadoVinculo: { findFirst: async () => ({ id: 'already' }) },
    } as never);
    await assert.rejects(
      () => service.vincular('v1', { interessadoId: 'n1' }, user()),
      ConflictException,
    );
  });

  it('recusa interessado de outro tenant no vínculo', async () => {
    const service = new ImoveisUsadosService({
      vendaUsado: {
        findFirst: async () => ({
          id: 'v1',
          tenantId: 't1',
          precoVenda: 100,
          imovel: {
            tipo: CaptacaoImovelTipo.casa,
            logradouro: 'Rua',
            numero: '1',
            bairro: 'Centro',
            cidade: 'Recife',
            area: 80,
            areaConstruida: null,
            proprietario: { id: 'p', nome: 'A', telefone: '' },
          },
          responsavel: { id: 'u1', name: 'E', email: '' },
          funil: { id: 'f', name: 'VU', tipo: FunilTipo.venda_usados },
          funilEtapa: { id: 'e', label: 'Novo', slug: '', color: '', papel: null },
          _count: { vinculos: 0 },
          vinculos: [],
          historicos: [],
        }),
      },
      interessadoUsado: { findFirst: async () => null },
    } as never);
    await assert.rejects(
      () => service.vincular('v1', { interessadoId: 'n-b' }, user()),
      BadRequestException,
    );
  });

  it('matching só consulta interessados do mesmo tenant', async () => {
    let seenTenant: string | undefined;
    const service = new ImoveisUsadosService({
      vendaUsado: {
        findFirst: async () => ({
          id: 'v1',
          tenantId: 't1',
          precoVenda: 450000,
          imovel: {
            tipo: CaptacaoImovelTipo.apartamento,
            cidade: 'Recife',
            bairro: 'Centro',
            quartos: 3,
            banheiros: 2,
            vagas: 1,
            area: 80,
          },
          vinculos: [],
        }),
      },
      interessadoUsado: {
        findMany: async (args: { where: { tenantId: string } }) => {
          seenTenant = args.where.tenantId;
          return [
            {
              id: 'ok',
              tipoDesejado: CaptacaoImovelTipo.apartamento,
              cidade: 'Recife',
              bairros: 'Centro',
              precoMin: 400000,
              precoMax: 500000,
              quartosMin: 3,
              banheirosMin: 1,
              vagasMin: 1,
              areaMin: 70,
              nome: 'João',
              telefone: '',
              email: '',
              observacoes: '',
            },
          ];
        },
      },
    } as never);
    const rows = await service.matching('v1', user());
    assert.equal(seenTenant, 't1');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, 'ok');
  });

  it('matching não devolve venda de outro tenant', async () => {
    const service = new ImoveisUsadosService({
      vendaUsado: { findFirst: async () => null },
    } as never);
    await assert.rejects(
      () => service.matching('v-b', user()),
      NotFoundException,
    );
  });

  it('não atualiza ficha de venda de outro tenant', async () => {
    const service = new ImoveisUsadosService({
      vendaUsado: { findFirst: async () => null },
    } as never);
    await assert.rejects(
      () =>
        service.updateImovelFicha(
          'v-x',
          { descricao: 'texto' },
          user({ tenantId: 't2' }),
        ),
      NotFoundException,
    );
  });
});
