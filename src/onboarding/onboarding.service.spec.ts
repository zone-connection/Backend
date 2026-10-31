import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { OnboardingEtapaStatus, OnboardingStatus, Role } from '@prisma/client';
import { ETAPAS_PADRAO, OnboardingService } from './onboarding.service';

const TENANT = '22222222-2222-4222-8222-222222222222';
const admin = { id: 'u1', role: Role.super_admin, tenantId: null, name: 'Super', email: 's@z.test' };

function harness() {
  const onboardings: any[] = [];
  const etapas: any[] = [];
  const historico: any[] = [];
  let seq = 1;
  const prisma = {
    tenant: { findUnique: async () => ({ id: TENANT, name: 'Aurora' }) },
    user: { findUnique: async () => ({ role: Role.super_admin }) },
    platformContrato: { findFirst: async () => ({ id: 'c1' }) },
    onboarding: {
      findFirst: async ({ where }: any) =>
        onboardings.find(
          (row) => row.tenantId === where.tenantId && where.status.in.includes(row.status),
        ) ?? null,
      count: async ({ where }: any) =>
        onboardings.filter((row) => row.tenantId === where.tenantId).length,
      create: async ({ data }: any) => {
        const id = `ob-${seq++}`;
        const row = {
          id,
          ...data,
          status: OnboardingStatus.nao_iniciado,
          concluidoEm: null,
          platformContrato: null,
          tenant: { id: TENANT, name: 'Aurora', slug: 'aurora', plano: 'prata', status: 'ativo' },
          responsavel: null,
          etapas: data.etapas.create.map((etapa: any, index: number) => ({
            id: `et-${id}-${index}`,
            ...etapa,
            status: OnboardingEtapaStatus.pendente,
            pendencia: '',
            observacao: '',
            concluidaEm: null,
          })),
        };
        onboardings.push(row);
        etapas.push(...row.etapas.map((etapa: any) => ({ ...etapa, onboardingId: id })));
        historico.push({ ...data.historico.create, onboardingId: id, id: `h-${id}`, createdAt: new Date(), autor: null });
        return row;
      },
      findUnique: async ({ where }: any) => {
        const row = onboardings.find((item) => item.id === where.id);
        if (!row) return null;
        row.etapas = etapas.filter((etapa) => etapa.onboardingId === row.id);
        return row;
      },
      findMany: async () => onboardings,
      update: async ({ where, data }: any) => {
        const row = onboardings.find((item) => item.id === where.id);
        Object.assign(row, data);
        return row;
      },
    },
    onboardingEtapa: {
      update: async ({ where, data }: any) => {
        const etapa = etapas.find((item) => item.id === where.id);
        Object.assign(etapa, data);
        return etapa;
      },
    },
    onboardingHistorico: {
      create: async ({ data }: any) => {
        historico.push({ ...data, id: `h-${historico.length}`, createdAt: new Date(), autor: { name: 'Super' } });
        return data;
      },
      findMany: async () => historico,
    },
  };
  return { service: new OnboardingService(prisma as never), onboardings, etapas };
}

const datas = { inicio: '2026-10-01', prazoPrevisto: '2026-10-20' };

describe('onboarding', () => {
  it('abre a implantação com as oito etapas obrigatórias e progresso zero', async () => {
    const { service } = harness();
    const row = await service.create({ tenantId: TENANT, ...datas }, admin as never);
    assert.equal(row.etapas.length, ETAPAS_PADRAO.length);
    assert.equal(row.progresso, 0);
    assert.ok(row.etapas.every((etapa) => etapa.obrigatoria && etapa.status === 'pendente'));
  });

  it('não conclui enquanto houver etapa obrigatória pendente', async () => {
    const { service } = harness();
    const row = await service.create({ tenantId: TENANT, ...datas }, admin as never);
    await assert.rejects(
      () => service.update(row.id, { status: 'concluido' }, admin as never),
      /obrigatórias pendentes/i,
    );
  });

  it('calcula o progresso e conclui só depois das etapas obrigatórias', async () => {
    const { service } = harness();
    const row = await service.create({ tenantId: TENANT, ...datas }, admin as never);
    let detalhe = await service.updateEtapa(row.id, row.etapas[0].id, { status: 'concluida' }, admin as never);
    assert.equal(detalhe.progresso, 13);
    for (const etapa of detalhe.etapas.filter((item) => item.status !== 'concluida')) {
      detalhe = await service.updateEtapa(row.id, etapa.id, { status: 'concluida' }, admin as never);
    }
    assert.equal(detalhe.progresso, 100);
    const concluida = await service.update(row.id, { status: 'concluido' }, admin as never);
    assert.equal(concluida.status, 'concluido');
  });

  it('impede duas implantações abertas e exige justificativa para um novo ciclo', async () => {
    const { service, onboardings, etapas } = harness();
    const primeira = await service.create({ tenantId: TENANT, ...datas }, admin as never);
    await assert.rejects(
      () => service.create({ tenantId: TENANT, ...datas }, admin as never),
      /em aberto/i,
    );
    const salva = onboardings.find((row) => row.id === primeira.id);
    salva.status = OnboardingStatus.concluido;
    for (const etapa of etapas) etapa.status = OnboardingEtapaStatus.concluida;
    await assert.rejects(
      () => service.create({ tenantId: TENANT, ...datas }, admin as never),
      /justificativa/i,
    );
    const novo = await service.create(
      { tenantId: TENANT, ...datas, justificativa: 'Troca de plano e nova equipe.' },
      admin as never,
    );
    assert.notEqual(novo.id, primeira.id);
    assert.equal(onboardings.length, 2);
  });

  it('marca atraso quando o prazo passou e a implantação segue aberta', async () => {
    const { service } = harness();
    const row = await service.create(
      { tenantId: TENANT, inicio: '2026-01-01', prazoPrevisto: '2026-01-02' },
      admin as never,
    );
    const lista = await service.list(admin as never, 'atrasadas');
    assert.equal(lista.some((item) => item.id === row.id && item.atrasado), true);
  });

  it('não deixa o admin da imobiliária consultar implantações', async () => {
    const { service } = harness();
    await assert.rejects(
      () => service.list({ ...admin, role: Role.admin, tenantId: TENANT } as never),
      /super admin/i,
    );
  });
});
