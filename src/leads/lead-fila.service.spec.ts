import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { LeadFilaEventoTipo, Role, UserStatus } from '@prisma/client';
import { LeadFilaService } from './lead-fila.service';

type Membro = {
  id: string;
  userId: string;
  ordem: number;
  ativo: boolean;
  user: { id: string; equipeId: string | null; status: UserStatus; role: Role };
};

function memoria() {
  const config = { id: 'cfg', ativa: true };
  const membros: Membro[] = [
    {
      id: 'm1',
      userId: 'u1',
      ordem: 1,
      ativo: true,
      user: { id: 'u1', equipeId: null, status: UserStatus.ativo, role: Role.corretor },
    },
    {
      id: 'm2',
      userId: 'u2',
      ordem: 2,
      ativo: true,
      user: { id: 'u2', equipeId: null, status: UserStatus.ativo, role: Role.gerente },
    },
    {
      id: 'm3',
      userId: 'u3',
      ordem: 3,
      ativo: false,
      user: { id: 'u3', equipeId: null, status: UserStatus.ativo, role: Role.treinee },
    },
  ];
  const leads = new Map<string, { corretorId: string | null; filaDistribuidoAt: Date | null }>();
  const eventos: { tipo: LeadFilaEventoTipo; userId?: string; leadId?: string }[] = [];
  let chain = Promise.resolve();

  const tx = {
    $queryRaw: async () => [{ id: config.id, ativa: config.ativa }],
    lead: {
      findFirst: async ({ where }: { where: { id: string; filaDistribuidoAt: null } }) => {
        const row = leads.get(where.id);
        if (!row || row.corretorId || row.filaDistribuidoAt) return null;
        return {
          id: where.id,
          nome: 'Lead',
          telefone: '1',
          origem: 'Manual',
          cidade: 'Recife',
          origemAtrasoLiberacao: null,
        };
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: { corretorId: string; filaDistribuidoAt: Date };
      }) => {
        const row = leads.get(where.id);
        if (!row || row.corretorId || row.filaDistribuidoAt) return { count: 0 };
        row.corretorId = data.corretorId;
        row.filaDistribuidoAt = data.filaDistribuidoAt;
        return { count: 1 };
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: { filaDistribuidoAt: Date };
      }) => {
        const row = leads.get(where.id);
        if (row) row.filaDistribuidoAt = data.filaDistribuidoAt;
      },
    },
    leadFilaMembro: {
      findMany: async () =>
        membros
          .filter((m) => m.ativo && m.user.status === UserStatus.ativo)
          .sort((a, b) => a.ordem - b.ordem),
      aggregate: async () => ({
        _max: { ordem: Math.max(...membros.map((m) => m.ordem)) },
      }),
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: { ordem: number; ultimaAtribuicaoAt?: Date };
      }) => {
        const membro = membros.find((m) => m.id === where.id);
        if (membro) membro.ordem = data.ordem;
      },
    },
    leadFilaEvento: {
      create: async ({ data }: { data: { tipo: LeadFilaEventoTipo; userId?: string; leadId?: string } }) => {
        eventos.push(data);
      },
    },
  };

  const prisma = {
    $transaction: (fn: (client: typeof tx) => Promise<unknown>) => {
      const run = chain.then(() => fn(tx));
      chain = run.then(() => undefined, () => undefined);
      return run;
    },
  };

  return { config, membros, leads, eventos, prisma };
}

function service(prisma: object) {
  return new LeadFilaService(prisma as never, { notifyAssigned: () => undefined } as never);
}

describe('LeadFilaService', () => {
  it('rotaciona e ignora integrante inativo', async () => {
    const db = memoria();
    db.leads.set('l1', { corretorId: null, filaDistribuidoAt: null });
    db.leads.set('l2', { corretorId: null, filaDistribuidoAt: null });
    db.leads.set('l3', { corretorId: null, filaDistribuidoAt: null });
    const fila = service(db.prisma);

    await fila.atribuirNovoLead({ tenantId: 't', leadId: 'l1', origem: 'Manual' });
    await fila.atribuirNovoLead({ tenantId: 't', leadId: 'l2', origem: 'Manual' });
    await fila.atribuirNovoLead({ tenantId: 't', leadId: 'l3', origem: 'Manual' });

    assert.equal(db.leads.get('l1')?.corretorId, 'u1');
    assert.equal(db.leads.get('l2')?.corretorId, 'u2');
    assert.equal(db.leads.get('l3')?.corretorId, 'u1');
    assert.equal(db.membros.find((m) => m.userId === 'u3')?.ordem, 3);
  });

  it('não redistribui o mesmo lead', async () => {
    const db = memoria();
    db.leads.set('l1', { corretorId: null, filaDistribuidoAt: null });
    const fila = service(db.prisma);
    await fila.atribuirNovoLead({ tenantId: 't', leadId: 'l1' });
    const segunda = await fila.atribuirNovoLead({ tenantId: 't', leadId: 'l1' });
    assert.equal(segunda.assigned, false);
    assert.equal(
      db.eventos.filter((e) => e.tipo === LeadFilaEventoTipo.atribuicao).length,
      1,
    );
  });

  it('registra falha quando não há integrantes ativos', async () => {
    const db = memoria();
    for (const membro of db.membros) membro.ativo = false;
    db.leads.set('l1', { corretorId: null, filaDistribuidoAt: null });
    const fila = service(db.prisma);
    const result = await fila.atribuirNovoLead({ tenantId: 't', leadId: 'l1' });
    assert.equal(result.motivo, 'sem_participante');
    assert.equal(db.leads.get('l1')?.corretorId, null);
    assert.equal(db.eventos[0]?.tipo, LeadFilaEventoTipo.sem_participante);
  });

  it('serializa duas atribuições simultâneas', async () => {
    const db = memoria();
    db.leads.set('a', { corretorId: null, filaDistribuidoAt: null });
    db.leads.set('b', { corretorId: null, filaDistribuidoAt: null });
    const fila = service(db.prisma);
    const [first, second] = await Promise.all([
      fila.atribuirNovoLead({ tenantId: 't', leadId: 'a' }),
      fila.atribuirNovoLead({ tenantId: 't', leadId: 'b' }),
    ]);
    const donos = [first.userId, second.userId].sort();
    assert.deepEqual(donos, ['u1', 'u2']);
  });

  it('não atribui com a fila pausada', async () => {
    const db = memoria();
    db.config.ativa = false;
    db.leads.set('l1', { corretorId: null, filaDistribuidoAt: null });
    const fila = service(db.prisma);
    const result = await fila.atribuirNovoLead({ tenantId: 't', leadId: 'l1' });
    assert.equal(result.motivo, 'fila_inativa');
    assert.equal(db.leads.get('l1')?.corretorId, null);
  });
});
