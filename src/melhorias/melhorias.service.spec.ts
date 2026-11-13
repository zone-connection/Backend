import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Role } from '@prisma/client';
import { comentariosVisiveis, MelhoriasService } from './melhorias.service';

const TENANT = '22222222-2222-4222-8222-222222222222';
const OUTRO = '33333333-3333-4333-8333-333333333333';
const superAdmin = { id: 'u1', role: Role.super_admin, tenantId: null, name: 'Super', email: 's@z.test' };

function matches(row: any, where: any): boolean {
  if (typeof where.tenantId === 'string' && row.tenantId !== where.tenantId) return false;
  if (where.status && row.status !== where.status) return false;
  if (where.prioridade && row.prioridade !== where.prioridade) return false;
  if (where.categoria && row.categoria !== where.categoria) return false;
  if (where.responsavelId && row.responsavelId !== where.responsavelId) return false;
  if (where.OR) {
    const q = where.OR[0].titulo.contains.toLowerCase();
    const titulo = row.titulo.toLowerCase().includes(q);
    const codigo = row.codigo.toLowerCase().includes(q);
    if (!titulo && !codigo) return false;
  }
  return true;
}

function harness() {
  const rows: any[] = [];
  const comentarios: any[] = [];
  const historico: any[] = [];
  let seq = 1;
  const prisma = {
    tenant: {
      findUnique: async ({ where }: any) =>
        where.id === TENANT || where.id === OUTRO ? { id: where.id } : null,
    },
    user: { findUnique: async () => ({ role: Role.super_admin }) },
    melhoriaSolicitacao: {
      findFirst: async () => {
        const last = [...rows].sort((a, b) => b.codigo.localeCompare(a.codigo))[0];
        return last ? { codigo: last.codigo } : null;
      },
      findMany: async ({ where }: any) => rows.filter((row) => matches(row, where)),
      findUnique: async ({ where }: any) => rows.find((row) => row.id === where.id) ?? null,
      create: async ({ data }: any) => {
        const now = new Date();
        const row = {
          id: `mel-${seq++}`,
          codigo: data.codigo,
          tenantId: data.tenantId,
          titulo: data.titulo,
          descricao: data.descricao,
          categoria: data.categoria,
          prioridade: data.prioridade,
          status: 'recebida',
          responsavelId: data.responsavelId,
          justificativaDecisao: '',
          createdAt: now,
          updatedAt: now,
          tenant: { id: data.tenantId, name: data.tenantId === TENANT ? 'Aurora' : 'Outra' },
          responsavel: data.responsavelId ? { id: data.responsavelId, name: 'Super' } : null,
        };
        rows.push(row);
        historico.push({
          ...data.historico.create,
          id: `h-${row.id}`,
          solicitacaoId: row.id,
          createdAt: now,
          autor: { name: 'Super' },
        });
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = rows.find((item) => item.id === where.id);
        Object.assign(row, data, { updatedAt: new Date(Date.now() + 120_000) });
        if (data.responsavelId) row.responsavel = { id: data.responsavelId, name: 'Super' };
        return row;
      },
    },
    melhoriaComentario: {
      create: async ({ data }: any) => {
        const row = {
          ...data,
          id: `c-${comentarios.length + 1}`,
          createdAt: new Date(Date.now() + comentarios.length),
          autor: { id: data.autorId, name: 'Super' },
        };
        comentarios.push(row);
        return row;
      },
      findMany: async ({ where }: any) =>
        comentarios.filter((item) => item.solicitacaoId === where.solicitacaoId),
    },
    melhoriaHistorico: {
      create: async ({ data }: any) => {
        historico.push({ ...data, id: `h-${historico.length}`, createdAt: new Date(), autor: { name: 'Super' } });
        return data;
      },
      findMany: async ({ where }: any) =>
        historico.filter((item) => item.solicitacaoId === where.solicitacaoId),
    },
  };
  return { service: new MelhoriasService(prisma as never), rows, historico };
}

describe('central de melhorias', () => {
  it('cria, edita, atribui e registra status no histórico', async () => {
    const { service, historico } = harness();
    const criada = await service.create(
      {
        tenantId: TENANT,
        titulo: 'Filtro por bairro',
        descricao: 'O funil precisa filtrar leads por bairro.',
        categoria: 'funcionalidade_nova',
      },
      superAdmin as never,
    );
    assert.match(criada.codigo, /^MEL-\d{4}-\d{4}$/);
    assert.equal(criada.tenantNome, 'Aurora');
    const editada = await service.update(
      criada.id,
      { titulo: 'Filtro por bairro no funil', responsavelId: 'u1', status: 'em_avaliacao' },
      superAdmin as never,
    );
    assert.equal(editada.titulo, 'Filtro por bairro no funil');
    assert.equal(editada.responsavelNome, 'Super');
    assert.equal(editada.recente, true);
    assert.ok(historico.some((item) => item.acao === 'status' && String(item.detalhe).includes('em_avaliacao')));
  });

  it('exige justificativa para aprovar ou recusar e mantém a arquivada consultável', async () => {
    const { service } = harness();
    const criada = await service.create(
      {
        tenantId: TENANT,
        titulo: 'Exportar PDF',
        descricao: 'Exportar a proposta em PDF.',
        categoria: 'melhoria_existente',
      },
      superAdmin as never,
    );
    await assert.rejects(
      () => service.update(criada.id, { status: 'aprovada' }, superAdmin as never),
      /justificativa/i,
    );
    const aprovada = await service.update(
      criada.id,
      { status: 'aprovada', justificativaDecisao: 'Entra no próximo ciclo interno.' },
      superAdmin as never,
    );
    assert.equal(aprovada.status, 'aprovada');
    const recusada = await service.update(
      criada.id,
      { status: 'recusada', justificativaDecisao: 'Fora do produto atual.' },
      superAdmin as never,
    );
    assert.equal(recusada.justificativaDecisao, 'Fora do produto atual.');
    await service.update(criada.id, { status: 'arquivada' }, superAdmin as never);
    const lista = await service.list(superAdmin as never, { status: 'arquivada' });
    assert.equal(lista.length, 1);
    assert.equal(lista[0].id, criada.id);
  });

  it('filtra por imobiliária e busca por código sem misturar tenants', async () => {
    const { service } = harness();
    const a = await service.create(
      { tenantId: TENANT, titulo: 'Mapa', descricao: 'Mapa de imóveis.', categoria: 'usabilidade' },
      superAdmin as never,
    );
    await service.create(
      { tenantId: OUTRO, titulo: 'WhatsApp', descricao: 'Outro pedido.', categoria: 'integracao' },
      superAdmin as never,
    );
    const porTenant = await service.list(superAdmin as never, { tenantId: TENANT });
    assert.deepEqual(porTenant.map((item) => item.id), [a.id]);
    const porCodigo = await service.list(superAdmin as never, { q: a.codigo });
    assert.equal(porCodigo.length, 1);
  });

  it('esconde nota interna de quem não é super admin e bloqueia o admin da imobiliária', async () => {
    const { service } = harness();
    const criada = await service.create(
      { tenantId: TENANT, titulo: 'Atalho', descricao: 'Atalho no menu.', categoria: 'usabilidade' },
      superAdmin as never,
    );
    const detalhe = await service.addComentario(
      criada.id,
      { texto: 'Não mostrar ao cliente', interna: true },
      superAdmin as never,
    );
    assert.equal(detalhe.comentarios[0].interna, true);
    const ocultas = comentariosVisiveis(Role.admin, [
      { id: '1', texto: 'Público', interna: false, createdAt: new Date(1), autor: null },
      { id: '2', texto: 'Segredo', interna: true, createdAt: new Date(2), autor: null },
    ]);
    assert.deepEqual(ocultas.map((item) => item.texto), ['Público']);
    await assert.rejects(
      () => service.list({ ...superAdmin, role: Role.admin, tenantId: TENANT } as never, { tenantId: OUTRO }),
      /super admin/i,
    );
  });
});
