import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  Role,
  UserStatus,
  VendaUsadoContratoStatus,
  VendaUsadoDocumentoCategoria,
  VendaUsadoDocumentoFornecedor,
  VendaUsadoDocumentoStatus,
  VendaUsadoDocumentoTipo,
  VendaUsadoFechamentoStatus,
  VendaUsadoPropostaStatus,
  VendaUsadoStatus,
} from '@prisma/client';
import { VendaUsadoFechamentoService } from './venda-usado-fechamento.service';
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

function doc(overrides: Record<string, unknown> = {}) {
  return {
    id: 'd1',
    categoria: VendaUsadoDocumentoCategoria.comprador,
    tipo: VendaUsadoDocumentoTipo.cpf,
    nome: 'CPF',
    obrigatorio: true,
    fornecedor: VendaUsadoDocumentoFornecedor.comprador,
    status: VendaUsadoDocumentoStatus.pendente,
    observacao: '',
    dataSolicitacao: new Date(),
    dataRecebimento: null,
    dataAnalise: null,
    analista: null,
    ...overrides,
  };
}

function fechamentoRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'f1',
    status: VendaUsadoFechamentoStatus.documentacao_pendente,
    observacoes: '',
    propostaId: 'p1',
    interessadoId: 'n1',
    responsavelId: 'u1',
    concluidoAt: null,
    canceladoAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    proposta: {
      id: 'p1',
      status: VendaUsadoPropostaStatus.aceita,
      valor: 480000,
      entrada: null,
      valorFinanciamento: null,
    },
    interessado: { id: 'n1', nome: 'João Silva', telefone: '' },
    responsavel: { id: 'u1', name: 'Maria' },
    documentos: [doc()],
    contrato: null,
    ...overrides,
  };
}

function txPrisma(partial: Record<string, unknown>) {
  const prisma: Record<string, unknown> = { ...partial };
  prisma.$transaction = async (fn: (tx: Record<string, unknown>) => unknown) =>
    fn(prisma);
  return prisma;
}

describe('VendaUsadoFechamentoService — fechamento', () => {
  it('cria fechamento com proposta aceita', async () => {
    let createdDocs = 0;
    const created = fechamentoRow();
    const service = new VendaUsadoFechamentoService(
      txPrisma({
        vendaUsado: {
          findFirst: async () => ({
            id: 'v1',
            status: VendaUsadoStatus.disponivel,
            imovelId: 'i1',
          }),
        },
        vendaUsadoFechamento: {
          findFirst: async () => null,
          create: async () => ({ id: 'f1' }),
          findFirstOrThrow: async () => created,
        },
        vendaUsadoProposta: {
          findFirst: async () => ({
            id: 'p1',
            interessadoId: 'n1',
            status: VendaUsadoPropostaStatus.aceita,
            valor: 480000,
          }),
        },
        interessadoUsado: {
          findFirst: async () => ({ id: 'n1', nome: 'João Silva' }),
        },
        user: {
          findFirst: async () => ({ id: 'u1', status: UserStatus.ativo }),
        },
        vendaUsadoDocumento: {
          createMany: async (args: { data: unknown[] }) => {
            createdDocs = args.data.length;
            return { count: args.data.length };
          },
        },
        vendaUsadoHistorico: { create: async () => ({}) },
      }) as never,
    );

    const result = await service.iniciar(
      'v1',
      { propostaId: 'p1' },
      user(),
    );
    assert.equal(result.id, 'f1');
    assert.equal(result.interessado.nome, 'João Silva');
    assert.ok(createdDocs >= 10);
  });

  it('rejeita proposta não aceita', async () => {
    const service = new VendaUsadoFechamentoService(
      txPrisma({
        vendaUsado: {
          findFirst: async () => ({
            id: 'v1',
            status: VendaUsadoStatus.disponivel,
            imovelId: 'i1',
          }),
        },
        vendaUsadoFechamento: { findFirst: async () => null },
        vendaUsadoProposta: {
          findFirst: async () => ({
            id: 'p1',
            interessadoId: 'n1',
            status: VendaUsadoPropostaStatus.enviada,
            valor: 100,
          }),
        },
      }) as never,
    );
    await assert.rejects(
      () => service.iniciar('v1', { propostaId: 'p1' }, user()),
      BadRequestException,
    );
  });

  it('rejeita proposta de outro tenant', async () => {
    const service = new VendaUsadoFechamentoService(
      txPrisma({
        vendaUsado: {
          findFirst: async () => ({
            id: 'v1',
            status: VendaUsadoStatus.disponivel,
            imovelId: 'i1',
          }),
        },
        vendaUsadoFechamento: { findFirst: async () => null },
        vendaUsadoProposta: { findFirst: async () => null },
      }) as never,
    );
    await assert.rejects(
      () => service.iniciar('v1', { propostaId: 'p-b' }, user()),
      BadRequestException,
    );
  });

  it('rejeita interessado de outro tenant', async () => {
    const service = new VendaUsadoFechamentoService(
      txPrisma({
        vendaUsado: {
          findFirst: async () => ({
            id: 'v1',
            status: VendaUsadoStatus.disponivel,
            imovelId: 'i1',
          }),
        },
        vendaUsadoFechamento: { findFirst: async () => null },
        vendaUsadoProposta: {
          findFirst: async () => ({
            id: 'p1',
            interessadoId: 'n-b',
            status: VendaUsadoPropostaStatus.aceita,
            valor: 100,
          }),
        },
        interessadoUsado: { findFirst: async () => null },
      }) as never,
    );
    await assert.rejects(
      () => service.iniciar('v1', { propostaId: 'p1' }, user()),
      BadRequestException,
    );
  });

  it('rejeita responsável de outro tenant', async () => {
    const service = new VendaUsadoFechamentoService(
      txPrisma({
        vendaUsado: {
          findFirst: async () => ({
            id: 'v1',
            status: VendaUsadoStatus.disponivel,
            imovelId: 'i1',
          }),
        },
        vendaUsadoFechamento: { findFirst: async () => null },
        vendaUsadoProposta: {
          findFirst: async () => ({
            id: 'p1',
            interessadoId: 'n1',
            status: VendaUsadoPropostaStatus.aceita,
            valor: 100,
          }),
        },
        interessadoUsado: {
          findFirst: async () => ({ id: 'n1', nome: 'João' }),
        },
        user: { findFirst: async () => null },
      }) as never,
    );
    await assert.rejects(
      () =>
        service.iniciar(
          'v1',
          { propostaId: 'p1', responsavelId: 'u-b' },
          user(),
        ),
      BadRequestException,
    );
  });

  it('impede fechamento duplicado devolvendo o existente', async () => {
    let created = 0;
    const existente = fechamentoRow();
    const service = new VendaUsadoFechamentoService(
      txPrisma({
        vendaUsado: {
          findFirst: async () => ({
            id: 'v1',
            status: VendaUsadoStatus.disponivel,
            imovelId: 'i1',
          }),
        },
        vendaUsadoFechamento: {
          findFirst: async () => existente,
          create: async () => {
            created += 1;
            return { id: 'f2' };
          },
        },
      }) as never,
    );
    const result = await service.iniciar(
      'v1',
      { propostaId: 'p1' },
      user(),
    );
    assert.equal(result.id, 'f1');
    assert.equal(created, 0);
  });

  it('cancela fechamento em andamento', async () => {
    const service = new VendaUsadoFechamentoService(
      txPrisma({
        vendaUsado: {
          findFirst: async () => ({
            id: 'v1',
            status: VendaUsadoStatus.disponivel,
            imovelId: 'i1',
          }),
        },
        vendaUsadoFechamento: {
          findFirst: async () => ({
            id: 'f1',
            status: VendaUsadoFechamentoStatus.documentacao_pendente,
            propostaId: 'p1',
          }),
          update: async () =>
            fechamentoRow({ status: VendaUsadoFechamentoStatus.cancelado }),
        },
        vendaUsadoHistorico: { create: async () => ({}) },
      }) as never,
    );
    const result = await service.update(
      'v1',
      { status: VendaUsadoFechamentoStatus.cancelado },
      user(),
    );
    assert.equal(result.status, VendaUsadoFechamentoStatus.cancelado);
  });

  it('não devolve fechamento de outro tenant', async () => {
    const service = new VendaUsadoFechamentoService({
      vendaUsado: { findFirst: async () => null },
    } as never);
    await assert.rejects(() => service.get('v-b', user()), NotFoundException);
  });
});

describe('VendaUsadoFechamentoService — documentação', () => {
  it('cria item extra no checklist', async () => {
    const created = doc({
      id: 'd-new',
      nome: 'Certidão extra',
      tipo: VendaUsadoDocumentoTipo.certidao,
    });
    const service = new VendaUsadoFechamentoService(
      txPrisma({
        vendaUsado: {
          findFirst: async () => ({
            id: 'v1',
            status: VendaUsadoStatus.disponivel,
            imovelId: 'i1',
          }),
        },
        vendaUsadoFechamento: {
          findFirst: async () => ({
            id: 'f1',
            status: VendaUsadoFechamentoStatus.documentacao_pendente,
          }),
          update: async () => ({}),
        },
        vendaUsadoDocumento: {
          create: async () => created,
          findMany: async () => [created],
        },
        vendaUsadoContrato: { findFirst: async () => null },
        vendaUsadoHistorico: { create: async () => ({}) },
      }) as never,
    );
    const result = await service.createDocumento(
      'v1',
      {
        categoria: VendaUsadoDocumentoCategoria.imovel,
        tipo: VendaUsadoDocumentoTipo.certidao,
        nome: 'Certidão extra',
        fornecedor: VendaUsadoDocumentoFornecedor.imobiliaria,
      },
      user(),
    );
    assert.equal(result.nome, 'Certidão extra');
  });

  it('recebe, analisa, aprova, recusa e recebe novamente', async () => {
    const states: VendaUsadoDocumentoStatus[] = [
      VendaUsadoDocumentoStatus.pendente,
    ];
    const service = new VendaUsadoFechamentoService(
      txPrisma({
        vendaUsado: {
          findFirst: async () => ({
            id: 'v1',
            status: VendaUsadoStatus.disponivel,
            imovelId: 'i1',
          }),
        },
        vendaUsadoFechamento: {
          findFirst: async () => ({
            id: 'f1',
            status: VendaUsadoFechamentoStatus.documentacao_pendente,
          }),
          update: async () => ({}),
        },
        vendaUsadoDocumento: {
          findFirst: async () => doc({ status: states[0] }),
          update: async (args: { data: { status: VendaUsadoDocumentoStatus } }) => {
            states[0] = args.data.status;
            return doc({ status: args.data.status });
          },
          findMany: async () => [doc({ status: states[0] })],
        },
        vendaUsadoContrato: { findFirst: async () => null },
        vendaUsadoHistorico: { create: async () => ({}) },
        user: {
          findFirst: async () => ({ id: 'u1', status: UserStatus.ativo }),
        },
      }) as never,
    );

    await service.updateDocumento(
      'v1',
      'd1',
      { status: VendaUsadoDocumentoStatus.recebido },
      user(),
    );
    await service.updateDocumento(
      'v1',
      'd1',
      { status: VendaUsadoDocumentoStatus.em_analise },
      user(),
    );
    await service.updateDocumento(
      'v1',
      'd1',
      { status: VendaUsadoDocumentoStatus.aprovado },
      user(),
    );
    await service.updateDocumento(
      'v1',
      'd1',
      { status: VendaUsadoDocumentoStatus.recusado },
      user(),
    );
    const again = await service.updateDocumento(
      'v1',
      'd1',
      { status: VendaUsadoDocumentoStatus.recebido },
      user(),
    );
    assert.equal(again.status, VendaUsadoDocumentoStatus.recebido);
  });

  it('não altera documento de outro tenant', async () => {
    const service = new VendaUsadoFechamentoService({
      vendaUsado: {
        findFirst: async () => ({
          id: 'v1',
          status: VendaUsadoStatus.disponivel,
          imovelId: 'i1',
        }),
      },
      vendaUsadoFechamento: {
        findFirst: async () => ({
          id: 'f1',
          status: VendaUsadoFechamentoStatus.documentacao_pendente,
        }),
      },
      vendaUsadoDocumento: { findFirst: async () => null },
    } as never);
    await assert.rejects(
      () =>
        service.updateDocumento(
          'v1',
          'd-b',
          { status: VendaUsadoDocumentoStatus.recebido },
          user(),
        ),
      NotFoundException,
    );
  });
});

describe('VendaUsadoFechamentoService — contrato', () => {
  it('cria contrato em rascunho', async () => {
    const service = new VendaUsadoFechamentoService(
      txPrisma({
        vendaUsado: {
          findFirst: async () => ({
            id: 'v1',
            status: VendaUsadoStatus.disponivel,
            imovelId: 'i1',
          }),
        },
        vendaUsadoFechamento: {
          findFirst: async () => ({
            id: 'f1',
            status: VendaUsadoFechamentoStatus.contrato_em_elaboracao,
          }),
          update: async () => ({}),
        },
        vendaUsadoContrato: {
          findFirst: async () => null,
          count: async () => 0,
          create: async () => ({
            id: 'c1',
            numero: 'CT-0001',
            status: VendaUsadoContratoStatus.rascunho,
            observacoes: '',
            dataCriacao: new Date(),
            dataEnvio: null,
            dataAssinatura: null,
            assinadoPor: null,
          }),
        },
        vendaUsadoDocumento: { findMany: async () => [] },
        vendaUsadoHistorico: { create: async () => ({}) },
      }) as never,
    );
    const result = await service.createContrato('v1', {}, user());
    assert.equal(result.numero, 'CT-0001');
    assert.equal(result.status, VendaUsadoContratoStatus.rascunho);
  });

  it('envia e marca como assinado', async () => {
    let status: VendaUsadoContratoStatus =
      VendaUsadoContratoStatus.em_elaboracao;
    const service = new VendaUsadoFechamentoService(
      txPrisma({
        vendaUsado: {
          findFirst: async () => ({
            id: 'v1',
            status: VendaUsadoStatus.disponivel,
            imovelId: 'i1',
          }),
        },
        vendaUsadoFechamento: {
          findFirst: async () => ({
            id: 'f1',
            status: VendaUsadoFechamentoStatus.contrato_em_elaboracao,
          }),
          update: async () => ({}),
        },
        vendaUsadoContrato: {
          findFirst: async () => ({
            id: 'c1',
            numero: 'CT-0001',
            status,
            dataEnvio: null,
          }),
          update: async (args: { data: { status: VendaUsadoContratoStatus } }) => {
            status = args.data.status;
            return {
              id: 'c1',
              numero: 'CT-0001',
              status,
              observacoes: '',
              dataCriacao: new Date(),
              dataEnvio: new Date(),
              dataAssinatura:
                status === VendaUsadoContratoStatus.assinado ? new Date() : null,
              assinadoPor:
                status === VendaUsadoContratoStatus.assinado
                  ? { id: 'u1', name: 'Maria' }
                  : null,
            };
          },
        },
        vendaUsadoDocumento: { findMany: async () => [] },
        vendaUsadoHistorico: { create: async () => ({}) },
      }) as never,
    );
    await service.updateContrato(
      'v1',
      { status: VendaUsadoContratoStatus.enviado },
      user(),
    );
    await service.updateContrato(
      'v1',
      { status: VendaUsadoContratoStatus.aguardando_assinatura },
      user(),
    );
    const signed = await service.updateContrato(
      'v1',
      { status: VendaUsadoContratoStatus.assinado },
      user(),
    );
    assert.equal(signed.status, VendaUsadoContratoStatus.assinado);
    assert.ok(signed.assinadoPor);
  });

  it('cancela contrato', async () => {
    const service = new VendaUsadoFechamentoService(
      txPrisma({
        vendaUsado: {
          findFirst: async () => ({
            id: 'v1',
            status: VendaUsadoStatus.disponivel,
            imovelId: 'i1',
          }),
        },
        vendaUsadoFechamento: {
          findFirst: async () => ({
            id: 'f1',
            status: VendaUsadoFechamentoStatus.contrato_enviado,
          }),
          update: async () => ({}),
        },
        vendaUsadoContrato: {
          findFirst: async () => ({
            id: 'c1',
            numero: 'CT-0001',
            status: VendaUsadoContratoStatus.enviado,
            dataEnvio: new Date(),
          }),
          update: async () => ({
            id: 'c1',
            numero: 'CT-0001',
            status: VendaUsadoContratoStatus.cancelado,
            observacoes: '',
            dataCriacao: new Date(),
            dataEnvio: new Date(),
            dataAssinatura: null,
            assinadoPor: null,
          }),
        },
        vendaUsadoDocumento: { findMany: async () => [] },
        vendaUsadoHistorico: { create: async () => ({}) },
      }) as never,
    );
    const result = await service.updateContrato(
      'v1',
      { status: VendaUsadoContratoStatus.cancelado },
      user(),
    );
    assert.equal(result.status, VendaUsadoContratoStatus.cancelado);
  });

  it('não devolve contrato de outro tenant', async () => {
    const service = new VendaUsadoFechamentoService({
      vendaUsado: { findFirst: async () => null },
    } as never);
    await assert.rejects(
      () => service.getContrato('v-b', user()),
      NotFoundException,
    );
  });
});

describe('VendaUsadoFechamentoService — conclusão', () => {
  it('impede com documentação incompleta', async () => {
    const service = new VendaUsadoFechamentoService({
      vendaUsado: {
        findFirst: async () => ({
          id: 'v1',
          status: VendaUsadoStatus.disponivel,
          imovelId: 'i1',
        }),
      },
      vendaUsadoFechamento: {
        findFirst: async () => ({
          id: 'f1',
          status: VendaUsadoFechamentoStatus.documentacao_pendente,
          propostaId: 'p1',
        }),
      },
      vendaUsadoProposta: {
        findFirst: async () => ({
          id: 'p1',
          status: VendaUsadoPropostaStatus.aceita,
        }),
      },
      vendaUsadoDocumento: {
        findMany: async () => [doc({ status: VendaUsadoDocumentoStatus.pendente })],
      },
    } as never);
    await assert.rejects(() => service.concluir('v1', user()), BadRequestException);
  });

  it('impede com contrato não assinado', async () => {
    const service = new VendaUsadoFechamentoService({
      vendaUsado: {
        findFirst: async () => ({
          id: 'v1',
          status: VendaUsadoStatus.disponivel,
          imovelId: 'i1',
        }),
      },
      vendaUsadoFechamento: {
        findFirst: async () => ({
          id: 'f1',
          status: VendaUsadoFechamentoStatus.aguardando_assinatura,
          propostaId: 'p1',
        }),
      },
      vendaUsadoProposta: {
        findFirst: async () => ({
          id: 'p1',
          status: VendaUsadoPropostaStatus.aceita,
        }),
      },
      vendaUsadoDocumento: {
        findMany: async () => [doc({ status: VendaUsadoDocumentoStatus.aprovado })],
      },
      vendaUsadoContrato: {
        findFirst: async () => ({
          status: VendaUsadoContratoStatus.aguardando_assinatura,
        }),
      },
    } as never);
    await assert.rejects(() => service.concluir('v1', user()), BadRequestException);
  });

  it('impede com proposta não aceita', async () => {
    const service = new VendaUsadoFechamentoService({
      vendaUsado: {
        findFirst: async () => ({
          id: 'v1',
          status: VendaUsadoStatus.disponivel,
          imovelId: 'i1',
        }),
      },
      vendaUsadoFechamento: {
        findFirst: async () => ({
          id: 'f1',
          status: VendaUsadoFechamentoStatus.aguardando_assinatura,
          propostaId: 'p1',
        }),
      },
      vendaUsadoProposta: {
        findFirst: async () => ({
          id: 'p1',
          status: VendaUsadoPropostaStatus.recusada,
        }),
      },
    } as never);
    await assert.rejects(() => service.concluir('v1', user()), BadRequestException);
  });

  it('conclui a venda e marca como vendido', async () => {
    let vendaStatus: VendaUsadoStatus = VendaUsadoStatus.disponivel;
    let fechamentoStatus: VendaUsadoFechamentoStatus =
      VendaUsadoFechamentoStatus.aguardando_assinatura;
    let historico = 0;
    const done = fechamentoRow({
      status: VendaUsadoFechamentoStatus.concluido,
      documentos: [doc({ status: VendaUsadoDocumentoStatus.aprovado })],
      contrato: {
        id: 'c1',
        numero: 'CT-0001',
        status: VendaUsadoContratoStatus.assinado,
        observacoes: '',
        dataCriacao: new Date(),
        dataEnvio: new Date(),
        dataAssinatura: new Date(),
        assinadoPor: { id: 'u1', name: 'Maria' },
      },
    });
    const service = new VendaUsadoFechamentoService(
      txPrisma({
        vendaUsado: {
          findFirst: async () => ({
            id: 'v1',
            status: vendaStatus,
            imovelId: 'i1',
          }),
          update: async (args: { data: { status: VendaUsadoStatus } }) => {
            vendaStatus = args.data.status;
            return {};
          },
        },
        vendaUsadoFechamento: {
          findFirst: async (args?: {
            where?: {
              status?: VendaUsadoFechamentoStatus;
              id?: { not?: string };
            };
            include?: unknown;
          }) => {
            if (args?.where?.id?.not) return null;
            if (
              fechamentoStatus === VendaUsadoFechamentoStatus.concluido ||
              args?.include
            ) {
              return done;
            }
            return {
              id: 'f1',
              status: fechamentoStatus,
              propostaId: 'p1',
              interessadoId: 'n1',
              responsavelId: 'u1',
            };
          },
          update: async (args: {
            data: { status: VendaUsadoFechamentoStatus };
          }) => {
            fechamentoStatus = args.data.status;
            return {};
          },
        },
        vendaUsadoProposta: {
          findFirst: async () => ({
            id: 'p1',
            status: VendaUsadoPropostaStatus.aceita,
          }),
        },
        vendaUsadoDocumento: {
          findMany: async () => [
            doc({ status: VendaUsadoDocumentoStatus.aprovado }),
          ],
        },
        vendaUsadoContrato: {
          findFirst: async () => ({
            status: VendaUsadoContratoStatus.assinado,
          }),
        },
        vendaUsadoHistorico: {
          create: async () => {
            historico += 1;
            return {};
          },
        },
        vendaUsadoPosVenda: {
          findFirst: async () => null,
          create: async () => ({ id: 'pv1' }),
        },
        vendaUsadoPosVendaPendencia: { createMany: async () => ({ count: 4 }) },
        imovel: {
          findFirst: async () => ({ proprietarioId: 'pr1' }),
        },
      }) as never,
    );

    const result = await service.concluir('v1', user());
    assert.equal(vendaStatus, VendaUsadoStatus.vendido);
    assert.equal(fechamentoStatus, VendaUsadoFechamentoStatus.concluido);
    assert.equal(result.status, VendaUsadoFechamentoStatus.concluido);
    assert.ok(historico >= 1);
  });

  it('impede segundo fechamento concluído para o imóvel', async () => {
    const service = new VendaUsadoFechamentoService({
      vendaUsado: {
        findFirst: async () => ({
          id: 'v1',
          status: VendaUsadoStatus.disponivel,
          imovelId: 'i1',
        }),
      },
      vendaUsadoFechamento: {
        findFirst: async (args: { where?: { id?: { not?: string } } }) => {
          if (args.where?.id?.not) return { id: 'f-other' };
          return {
            id: 'f1',
            status: VendaUsadoFechamentoStatus.aguardando_assinatura,
            propostaId: 'p1',
          };
        },
      },
      vendaUsadoProposta: {
        findFirst: async () => ({
          id: 'p1',
          status: VendaUsadoPropostaStatus.aceita,
        }),
      },
      vendaUsadoDocumento: {
        findMany: async () => [doc({ status: VendaUsadoDocumentoStatus.aprovado })],
      },
      vendaUsadoContrato: {
        findFirst: async () => ({ status: VendaUsadoContratoStatus.assinado }),
      },
    } as never);
    await assert.rejects(() => service.concluir('v1', user()), ConflictException);
  });
});
