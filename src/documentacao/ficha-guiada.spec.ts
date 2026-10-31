import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CatalogType, ContatoTipo, Role, TenantPlano } from '@prisma/client';
import { DocumentacaoService } from './documentacao.service';
import type { AuthenticatedUser } from '../common/types/authenticated-user';

const TENANT = 'tenant-1';

function pessoa(partial: Partial<AuthenticatedUser> & Pick<AuthenticatedUser, 'id' | 'role'>): AuthenticatedUser {
  return {
    email: `${partial.id}@teste.local`,
    name: partial.id,
    tenantId: TENANT,
    ...partial,
  };
}

function memoria(flag: boolean) {
  const docs = new Map<string, Record<string, unknown>>();
  let seq = 0;
  const catalog = [
    { type: CatalogType.documentacao_fonte, label: 'Outro' },
    { type: CatalogType.documentacao_status1, label: 'Em análise' },
    { type: CatalogType.documentacao_status1, label: 'Aprovado' },
    { type: CatalogType.documentacao_status1, label: 'Reprovado' },
    { type: CatalogType.documentacao_status2, label: 'Andamento' },
    { type: CatalogType.documentacao_status2, label: 'Vendido' },
  ];
  const prisma = {
    tenant: {
      findUnique: async () => ({
        plano: TenantPlano.ouro,
        modules: flag ? { fichaAnaliseGuiada: true } : {},
      }),
    },
    catalogItem: {
      findMany: async (args: { where: { type?: CatalogType | { in: CatalogType[] } } }) => {
        const type = args.where.type;
        if (type && typeof type === 'object' && 'in' in type) {
          return catalog.filter((item) => type.in.includes(item.type));
        }
        return catalog.filter((item) => item.type === type);
      },
    },
    lead: {
      findFirst: async () => ({
        id: 'lead-1',
        tipo: ContatoTipo.lead,
        stage: 'em-analise',
        tags: [] as string[],
      }),
      update: async () => ({}),
    },
    user: {
      findFirst: async (args: { where: { id?: string } }) => {
        if (args.where.id === 'corretor-1') {
          return {
            id: 'corretor-1',
            equipe: { gerenteId: 'gerente-1' },
          };
        }
        if (args.where.id === 'gerente-1') {
          return { id: 'gerente-1', equipe: { gerenteId: 'gerente-1' } };
        }
        return null;
      },
    },
    documentacao: {
      findFirst: async (args: { where: { id?: string; leadId?: string } }) => {
        if (args.where.id) return docs.get(args.where.id) ?? null;
        if (args.where.leadId) {
          return [...docs.values()].find((doc) => doc.leadId === args.where.leadId) ?? null;
        }
        return [...docs.values()][0] ?? null;
      },
      create: async (args: { data: Record<string, unknown> }) => {
        seq += 1;
        const row = {
          id: `doc-${seq}`,
          autor: { id: args.data.autorId, name: 'Quem abriu' },
          gerente: { id: args.data.gerenteId, name: 'Gerente' },
          ...args.data,
        };
        docs.set(row.id as string, row);
        return row;
      },
      update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
        const current = docs.get(args.where.id);
        if (!current) throw new Error('ficha ausente');
        const next = { ...current, ...args.data };
        docs.set(args.where.id, next);
        return next;
      },
    },
  };
  const service = new DocumentacaoService(
    prisma as never,
    { getVisibleCorretorIds: async () => [] } as never,
  );
  return { service, docs };
}

const entrada = {
  leadId: 'lead-1',
  nome: 'Mariana',
  construtoraId: 'construtora-1',
  empreendimentoId: 'empreendimento-1',
  fonte: 'Outro',
};

describe('ficha guiada na análise', () => {
  it('não abre ficha quando a imobiliária não ligou a opção', async () => {
    const { service } = memoria(false);
    await assert.rejects(
      () => service.abrirFichaGuiada(entrada, pessoa({ id: 'corretor-1', role: Role.corretor })),
      /não está ativa/,
    );
  });

  it('exige construtora, empreendimento e fonte', async () => {
    const { service } = memoria(true);
    await assert.rejects(
      () =>
        service.abrirFichaGuiada(
          { ...entrada, construtoraId: '', empreendimentoId: '', fonte: '' },
          pessoa({ id: 'corretor-1', role: Role.corretor }),
        ),
      /fonte/,
    );
  });

  it('cria a ficha com data, autor, gerente e status iniciais', async () => {
    const { service } = memoria(true);
    const created = await service.abrirFichaGuiada(
      entrada,
      pessoa({ id: 'corretor-1', role: Role.corretor }),
    );
    assert.equal(created.autorId, 'corretor-1');
    assert.equal(created.gerenteId, 'gerente-1');
    assert.equal(created.status1, 'Em análise');
    assert.equal(created.status2, 'Andamento');
    assert.equal(created.construtoraId, 'construtora-1');
    assert.equal(created.empreendimentoId, 'empreendimento-1');
    assert.equal(created.fonte, 'Outro');
    assert.equal(created.leadId, 'lead-1');
    assert.ok(created.dataAnalise instanceof Date);
  });

  it('não deixa outra pessoa editar a ficha quando a opção está ligada', async () => {
    const { service } = memoria(true);
    const created = await service.abrirFichaGuiada(
      entrada,
      pessoa({ id: 'corretor-1', role: Role.corretor }),
    );
    await assert.rejects(
      () =>
        service.update(
          created.id as string,
          { status1: 'Aprovado', status2: 'Andamento' },
          pessoa({ id: 'gerente-1', role: Role.gerente }),
        ),
      /você mesmo abriu/i,
    );
  });

  it('quem abriu atualiza a ficha para aprovado', async () => {
    const { service } = memoria(true);
    const created = await service.abrirFichaGuiada(
      entrada,
      pessoa({ id: 'corretor-1', role: Role.corretor }),
    );
    const updated = await service.update(
      created.id as string,
      { status1: 'Aprovado', status2: 'Andamento' },
      pessoa({ id: 'corretor-1', role: Role.corretor }),
    );
    assert.equal(updated.status1, 'Aprovado');
    assert.equal(updated.status2, 'Andamento');
  });

  it('sem a opção, o gerente continua editando ficha de outra pessoa', async () => {
    const { service, docs } = memoria(false);
    docs.set('doc-manual', {
      id: 'doc-manual',
      leadId: 'lead-1',
      autorId: 'corretor-1',
      corretorId: 'corretor-1',
      gerenteId: 'gerente-1',
      status1: 'Em análise',
      status2: 'Andamento',
      dataAnalise: new Date(),
      dataVenda: null,
      vgv: null,
    });
    const updated = await service.update(
      'doc-manual',
      { status2: 'Vendido', vgv: 180000 },
      pessoa({ id: 'gerente-1', role: Role.gerente }),
    );
    assert.equal(updated.status2, 'Vendido');
    assert.equal(updated.vgv, 180000);
  });

  it('corretor não cadastra documentação avulsa com a opção desligada', async () => {
    const { service } = memoria(false);
    await assert.rejects(
      () =>
        service.create(
          {
            nome: 'Mariana',
            fonte: 'Outro',
            status1: 'Em análise',
            status2: 'Andamento',
          },
          pessoa({ id: 'corretor-1', role: Role.corretor }),
        ),
      /não cadastram documentação/,
    );
  });
});
