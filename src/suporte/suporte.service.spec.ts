import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Role, SuporteStatus } from '@prisma/client';
import { mensagensVisiveis, SuporteService } from './suporte.service';

const TENANT = '22222222-2222-4222-8222-222222222222';
const OUTRO = '33333333-3333-4333-8333-333333333333';
const superAdmin = { id: 'u1', role: Role.super_admin, tenantId: null, name: 'Super', email: 's@z.test' };

function harness() {
  const chamados: any[] = [];
  const mensagens: any[] = [];
  const historico: any[] = [];
  let seq = 1;
  const prisma = {
    tenant: {
      findUnique: async ({ where }: any) =>
        where.id === TENANT || where.id === OUTRO ? { id: where.id } : null,
    },
    user: { findUnique: async () => ({ role: Role.super_admin }) },
    suporteChamado: {
      findFirst: async () => null,
      findMany: async ({ where }: any) =>
        chamados.filter((row) => !where.tenantId || row.tenantId === where.tenantId || where.tenantId.not),
      findUnique: async ({ where }: any) => chamados.find((row) => row.id === where.id) ?? null,
      create: async ({ data }: any) => {
        const row = {
          id: `ch-${seq++}`,
          codigo: data.codigo,
          tenantId: data.tenantId,
          titulo: data.titulo,
          descricao: data.descricao,
          categoria: data.categoria,
          prioridade: data.prioridade,
          status: SuporteStatus.aberto,
          responsavelId: data.responsavelId,
          prazoEm: data.prazoEm,
          resolvidoEm: null,
          fechadoEm: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          tenant: { id: data.tenantId, name: data.tenantId === TENANT ? 'Aurora' : 'Outra' },
          responsavel: data.responsavelId ? { id: data.responsavelId, name: 'Super' } : null,
        };
        chamados.push(row);
        historico.push({ ...data.historico.create, id: `h-${row.id}`, chamadoId: row.id, createdAt: new Date(), autor: { name: 'Super' } });
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = chamados.find((item) => item.id === where.id);
        Object.assign(row, data, { updatedAt: new Date() });
        if (data.responsavelId) row.responsavel = { id: data.responsavelId, name: 'Super' };
        return row;
      },
    },
    suporteMensagem: {
      create: async ({ data }: any) => {
        const row = {
          ...data,
          id: `m-${mensagens.length + 1}`,
          createdAt: new Date(Date.now() + mensagens.length),
          autor: { id: data.autorId, name: 'Super' },
        };
        mensagens.push(row);
        return row;
      },
      findMany: async ({ where }: any) =>
        mensagens.filter((item) => item.chamadoId === where.chamadoId),
    },
    suporteHistorico: {
      create: async ({ data }: any) => {
        historico.push({ ...data, id: `h-${historico.length}`, createdAt: new Date(), autor: { name: 'Super' } });
        return data;
      },
      findMany: async ({ where }: any) =>
        historico.filter((item) => item.chamadoId === where.chamadoId),
    },
  };
  return { service: new SuporteService(prisma as never), chamados, mensagens, historico };
}

describe('central de suporte', () => {
  it('cria, atribui responsável e reabre preservando o histórico', async () => {
    const { service, historico } = harness();
    const criado = await service.create(
      { tenantId: TENANT, titulo: 'Login falha', descricao: 'Admin não entra.', categoria: 'acesso' },
      superAdmin as never,
    );
    assert.match(criado.codigo, /^SUP-\d{4}-\d{4}$/);
    const atribuido = await service.update(criado.id, { responsavelId: 'u1', status: 'resolvido' }, superAdmin as never);
    assert.equal(atribuido.responsavelNome, 'Super');
    assert.equal(atribuido.status, 'resolvido');
    const reaberto = await service.update(criado.id, { status: 'aberto' }, superAdmin as never);
    assert.equal(reaberto.status, 'aberto');
    assert.equal(reaberto.resolvidoEm, null);
    assert.ok(historico.some((item) => item.acao === 'reaberto'));
    assert.ok(historico.some((item) => item.acao === 'criado'));
  });

  it('ordena mensagens e esconde nota interna de quem não é super admin', async () => {
    const { service } = harness();
    const criado = await service.create(
      { tenantId: TENANT, titulo: 'Dúvida', descricao: 'Como emitir boleto.', categoria: 'financeiro' },
      superAdmin as never,
    );
    await service.addMensagem(criado.id, { texto: 'Pública', interna: false }, superAdmin as never);
    const detalhe = await service.addMensagem(criado.id, { texto: 'Segredo interno', interna: true }, superAdmin as never);
    assert.deepEqual(detalhe.mensagens.map((item) => item.texto), ['Pública', 'Segredo interno']);
    const ocultas = mensagensVisiveis(Role.admin, [
      { id: '1', texto: 'Pública', interna: false, createdAt: new Date(2), autor: null },
      { id: '2', texto: 'Segredo interno', interna: true, createdAt: new Date(1), autor: null },
    ]);
    assert.deepEqual(ocultas.map((item) => item.texto), ['Pública']);
    assert.equal(ocultas[0].interna, false);
  });

  it('marca atraso só quando há prazo vencido e o chamado segue aberto', async () => {
    const { service } = harness();
    const criado = await service.create(
      {
        tenantId: TENANT,
        titulo: 'Integração',
        descricao: 'Meta não conecta.',
        categoria: 'integracao',
        prazoEm: '2026-01-02',
      },
      superAdmin as never,
    );
    const lista = await service.list(superAdmin as never, {});
    assert.equal(lista.find((item) => item.id === criado.id)?.atrasado, true);
  });

  it('não deixa o admin da imobiliária listar chamados', async () => {
    const { service } = harness();
    await assert.rejects(
      () => service.list({ ...superAdmin, role: Role.admin, tenantId: TENANT } as never, {}),
      /super admin/i,
    );
    await assert.rejects(
      () => service.findOne('ch-1', { ...superAdmin, role: Role.admin, tenantId: OUTRO } as never),
      /super admin/i,
    );
  });
});
