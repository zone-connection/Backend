import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TarefaStatus } from '@prisma/client';
import { TenantDemoDataService } from './tenant-demo-data.service';

describe('TenantDemoDataService seedTarefas', () => {
  it('grava as tarefas do dia, de ontem e de amanhã no admin', async () => {
    const created: { data: Record<string, unknown>[] } = { data: [] };
    const prisma = {
      imovel: {
        findMany: async () => [{ id: 'imovel-1' }, { id: 'imovel-2' }],
      },
      tarefa: {
        findMany: async () => [{ titulo: 'Enviar boleto da reserva' }],
        createMany: async (input: { data: Record<string, unknown>[] }) => {
          created.data = input.data;
          return { count: input.data.length };
        },
      },
    };
    const service = new TenantDemoDataService(prisma as never);
    const hoje = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
    }).format(new Date());

    const total = await (
      service as unknown as {
        seedTarefas: (
          tenantId: string,
          ctx: { leadIdByKey: Map<string, string>; adminId: string },
        ) => Promise<number>;
      }
    ).seedTarefas('tenant-1', {
      adminId: 'admin-1',
      leadIdByKey: new Map([
        ['leticia', 'lead-leticia'],
        ['camila', 'lead-camila'],
      ]),
    });

    assert.equal(total, 15);
    const rows = created.data;
    assert.equal(rows.length, 15);
    assert.equal(
      rows.some((row) => row.titulo === 'Enviar boleto da reserva'),
      false,
    );
    const reuniao = rows.find(
      (row) => row.titulo === 'Reunião com cliente – João Silva',
    );
    assert.equal(reuniao?.data, hoje);
    assert.equal(reuniao?.horario, '07:00');
    assert.equal(reuniao?.responsavelId, 'admin-1');
    assert.equal(reuniao?.imovelId, 'imovel-1');
    const leticia = rows.find(
      (row) => row.titulo === 'Follow-up – Cliente Letícia',
    );
    assert.equal(leticia?.leadId, 'lead-leticia');
    const atrasada = rows.find(
      (row) => row.titulo === 'Reagendar visita perdida',
    );
    assert.equal(atrasada?.leadId, 'lead-camila');
    assert.ok(String(atrasada?.data) < hoje);
    const concluida = rows.find(
      (row) => row.titulo === 'Fechar relatório do dia',
    );
    assert.equal(concluida?.status, TarefaStatus.concluida);
    assert.ok(concluida?.concluidaEm instanceof Date);
    const amanha = rows.find(
      (row) => row.titulo === 'Ligar para proposta parada',
    );
    assert.ok(String(amanha?.data) > hoje);
  });
});
