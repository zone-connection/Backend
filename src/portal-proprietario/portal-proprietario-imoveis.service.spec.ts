import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NotFoundException } from '@nestjs/common';
import {
  CaptacaoHistoricoTipo,
  VendaUsadoHistoricoTipo,
  VendaUsadoPropostaStatus,
  VendaUsadoStatus,
  VendaUsadoVisitaStatus,
} from '@prisma/client';
import { PortalProprietarioImoveisService } from './portal-proprietario-imoveis.service';
import type { PortalProprietarioSession } from './portal-proprietario.types';
import { PortalProprietarioController } from './portal-proprietario.controller';

const sessionA: PortalProprietarioSession = {
  acessoId: 'a1',
  proprietarioId: 'p1',
  tenantId: 't1',
  email: 'joao@ex.com',
  name: 'João',
};

const sessionB: PortalProprietarioSession = {
  ...sessionA,
  acessoId: 'a2',
  proprietarioId: 'p2',
};

const sessionOtherTenant: PortalProprietarioSession = {
  ...sessionA,
  tenantId: 't2',
};

function imovelA(overrides: Record<string, unknown> = {}) {
  return {
    id: 'i1',
    tenantId: 't1',
    proprietarioId: 'p1',
    tipo: 'apartamento',
    cep: '',
    logradouro: 'Rua Centro',
    numero: '10',
    complemento: '',
    bairro: 'Centro',
    cidade: 'Recife',
    estado: 'PE',
    area: 80,
    areaConstruida: 70,
    quartos: 2,
    suites: 1,
    banheiros: 2,
    vagas: 1,
    createdAt: new Date('2026-08-26'),
    captacoes: [
      {
        id: 'c1',
        createdAt: new Date('2026-08-26'),
        origem: 'indicação',
        exclusividade: false,
        valorPretendido: 450000,
        valorAvaliacao: 440000,
        funilEtapa: { label: 'Disponível' },
        responsavel: { name: 'Maria' },
      },
    ],
    vendaUsado: {
      id: 'v1',
      status: VendaUsadoStatus.disponivel,
      precoVenda: 450000,
      responsavel: { name: 'Maria' },
      funilEtapa: { label: 'Em negociação' },
      vinculos: [{ id: 'n1', interesse: 'em_contato' }],
      visitas: [{ id: 'vi1' }],
      propostas: [{ id: 'pr1', status: VendaUsadoPropostaStatus.enviada }],
    },
    ...overrides,
  };
}

describe('portal proprietário — isolamento e dados', () => {
  it('proprietário acessa seu imóvel', async () => {
    const prisma = {
      imovel: { findFirst: async () => imovelA() },
    };
    const service = new PortalProprietarioImoveisService(prisma as never);
    const item = await service.getImovel('i1', sessionA);
    assert.equal(item.id, 'i1');
    assert.equal(item.comercializacao?.interessados, 1);
  });

  it('proprietário não acessa imóvel de outro proprietário', async () => {
    const prisma = {
      imovel: { findFirst: async () => null },
    };
    const service = new PortalProprietarioImoveisService(prisma as never);
    await assert.rejects(
      () => service.getImovel('i1', sessionB),
      NotFoundException,
    );
  });

  it('proprietário não acessa imóvel de outro tenant', async () => {
    const prisma = {
      imovel: {
        findFirst: async (args: { where: { tenantId: string } }) => {
          assert.equal(args.where.tenantId, 't2');
          return null;
        },
      },
    };
    const service = new PortalProprietarioImoveisService(prisma as never);
    await assert.rejects(
      () => service.getImovel('i1', sessionOtherTenant),
      NotFoundException,
    );
  });

  it('propostas são filtradas pelo imóvel/proprietário', async () => {
    const prisma = {
      imovel: { findFirst: async () => imovelA() },
      vendaUsadoProposta: {
        findMany: async (args: {
          where: { vendaUsadoId: string; tenantId: string };
        }) => {
          assert.equal(args.where.vendaUsadoId, 'v1');
          assert.equal(args.where.tenantId, 't1');
          return [
            {
              id: 'pr1',
              valor: 430000,
              entrada: null,
              valorFinanciamento: null,
              status: VendaUsadoPropostaStatus.enviada,
              createdAt: new Date(),
              interessado: { nome: 'Ana' },
              negociacao: {
                status: 'em_negociacao',
                movimentos: [{ valor: 440000 }],
              },
            },
          ];
        },
      },
    };
    const service = new PortalProprietarioImoveisService(prisma as never);
    const propostas = await service.getPropostas('i1', sessionA);
    assert.equal(propostas[0].valor, 430000);
    assert.equal(propostas[0].negociacao?.ultimaContraproposta, 440000);
  });

  it('visita de outro imóvel não é encontrada', async () => {
    const prisma = {
      imovel: { findFirst: async () => null },
    };
    const service = new PortalProprietarioImoveisService(prisma as never);
    await assert.rejects(
      () => service.getVisitas('i-other', sessionA),
      NotFoundException,
    );
  });

  it('dashboard retorna somente seus imóveis', async () => {
    const prisma = {
      imovel: {
        findMany: async (args: {
          where: { proprietarioId: string; tenantId: string };
        }) => {
          assert.equal(args.where.proprietarioId, 'p1');
          assert.equal(args.where.tenantId, 't1');
          return [imovelA()];
        },
      },
    };
    const service = new PortalProprietarioImoveisService(prisma as never);
    const dash = await service.dashboard(sessionA);
    assert.equal(dash.resumo.total, 1);
    assert.equal(dash.imoveis[0].id, 'i1');
  });

  it('histórico omite edições internas', async () => {
    const prisma = {
      imovel: { findFirst: async () => imovelA() },
      captacaoHistorico: {
        findMany: async (args: {
          where: { tipo: { in: CaptacaoHistoricoTipo[] } };
        }) => {
          assert.equal(
            args.where.tipo.in.includes(CaptacaoHistoricoTipo.edicao),
            false,
          );
          return [
            {
              id: 'h1',
              tipo: CaptacaoHistoricoTipo.criacao,
              texto: 'Imóvel cadastrado',
              createdAt: new Date('2026-08-26'),
            },
          ];
        },
      },
      vendaUsadoHistorico: {
        findMany: async (args: {
          where: { tipo: { in: VendaUsadoHistoricoTipo[] } };
        }) => {
          assert.equal(
            args.where.tipo.in.includes(VendaUsadoHistoricoTipo.edicao),
            false,
          );
          return [
            {
              id: 'h2',
              tipo: VendaUsadoHistoricoTipo.visita,
              texto: 'Visita realizada',
              createdAt: new Date('2026-08-27'),
            },
          ];
        },
      },
    };
    const service = new PortalProprietarioImoveisService(prisma as never);
    const historico = await service.getHistorico('i1', sessionA);
    assert.equal(historico.length, 2);
  });

  it('visitas são filtradas pelo imóvel/proprietário', async () => {
    const prisma = {
      imovel: { findFirst: async () => imovelA() },
      vendaUsadoVisita: {
        findMany: async (args: {
          where: { vendaUsadoId: string; tenantId: string };
        }) => {
          assert.equal(args.where.vendaUsadoId, 'v1');
          return [
            {
              id: 'vi1',
              dataHora: new Date('2026-08-30T15:00:00Z'),
              status: VendaUsadoVisitaStatus.confirmada,
              feedbackAvaliacao: null,
              feedbackInteresse: null,
              feedbackComentarios: '',
              feedbackAt: null,
              interessado: { nome: 'Ana' },
            },
          ];
        },
      },
    };
    const service = new PortalProprietarioImoveisService(prisma as never);
    const visitas = await service.getVisitas('i1', sessionA);
    assert.equal(visitas.proximas.length, 1);
  });

  it('fechamento é filtrado pelo imóvel/proprietário', async () => {
    const prisma = {
      imovel: { findFirst: async () => imovelA() },
      vendaUsadoFechamento: {
        findFirst: async (args: {
          where: { vendaUsadoId: string; tenantId: string };
        }) => {
          assert.equal(args.where.vendaUsadoId, 'v1');
          return {
            status: 'iniciado',
            documentos: [
              { status: 'aprovado' },
              { status: 'aprovado' },
              { status: 'aprovado' },
              { status: 'pendente' },
            ],
            contrato: {
              numero: 'CT-0001',
              status: 'aguardando_assinatura',
              dataCriacao: new Date(),
            },
          };
        },
      },
    };
    const service = new PortalProprietarioImoveisService(prisma as never);
    const fechamento = await service.getFechamento('i1', sessionA);
    assert.equal(fechamento?.documentacao.aprovados, 3);
    assert.equal(fechamento?.documentacao.total, 4);
  });
});

describe('portal proprietário — somente leitura', () => {
  it('serviço não expõe métodos de alteração', () => {
    const service = new PortalProprietarioImoveisService({} as never);
    assert.equal(
      'createImovel' in service || 'updateImovel' in service,
      false,
    );
    assert.equal(typeof (service as { createProposta?: unknown }).createProposta, 'undefined');
    assert.equal(typeof (service as { updateDocumento?: unknown }).updateDocumento, 'undefined');
    assert.equal(typeof (service as { movimentarChave?: unknown }).movimentarChave, 'undefined');
    assert.equal(typeof (service as { concluirPosVenda?: unknown }).concluirPosVenda, 'undefined');
  });

  it('controller só declara leitura', () => {
    const proto = PortalProprietarioController.prototype;
    const names = Object.getOwnPropertyNames(proto);
    assert.equal(names.includes('create'), false);
    assert.equal(names.includes('update'), false);
    assert.equal(names.includes('patch'), false);
  });
});
