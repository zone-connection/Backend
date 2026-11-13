import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Role } from '@prisma/client';
import { ApiAccessGuard } from './api-access.guard';
import { ApiLeadsService } from './api-leads.service';
import { ApiTecnicoAdapter } from './api-tecnico.adapter';
import { AtualizarLeadApiDto } from './dto/atualizar-lead-api.dto';
import { MoverLeadApiDto } from './dto/mover-lead-api.dto';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

const tecnico = {
  id: 'tecnico-1',
  email: 'integracao+a@api.zoneconnection.invalid',
  name: 'Integração API',
  role: Role.admin,
  tenantId: A,
  permissions: { modules: {}, actions: {} },
};

function cenario(opts?: { etapaAtiva?: boolean }) {
  const chamadas: Array<{ metodo: string; dto: unknown; actorId: string }> = [];
  const prisma = {
    lead: {
      findFirst: async ({ where }: { where: { id: string; tenantId: string } }) => {
        if (where.id !== 'l1' || where.tenantId !== A) return null;
        return { id: 'l1', funilId: 'funil-a', tenantId: A };
      },
    },
    funilEtapa: {
      findFirst: async ({ where }: { where: { funilId: string; slug: string; active: boolean } }) => {
        const ok = where.funilId === 'funil-a' && where.slug === 'contato' && where.active && opts?.etapaAtiva !== false;
        return ok ? { id: 'etapa-contato' } : null;
      },
    },
    user: { findFirst: async () => ({ ...tecnico, role: Role.assistente, status: 'ativo' }) },
  };
  const leads = {
    update: async (id: string, dto: Record<string, unknown>, actor: { id: string }) => {
      chamadas.push({ metodo: 'update', dto, actorId: actor.id });
      return {
        id,
        nome: String(dto.nome ?? 'Ana'),
        telefone: '(81) 98888-7777',
        email: 'ana@email.com',
        origem: 'Site',
        interesse: 'Comprar',
        cidade: 'Recife',
        bairro: 'Boa Viagem',
        stage: 'novo',
        funilId: 'funil-a',
        prioridade: 'Alta',
        corretorId: null,
        corretor: { name: 'Carla', cpf: '000' },
        cpf: '123',
        createdAt: new Date('2026-11-07T12:00:00.000Z'),
        updatedAt: new Date('2026-11-07T13:00:00.000Z'),
      };
    },
    updateStage: async (id: string, dto: { stage: string; omitTriagem?: boolean }, actor: { id: string; role: Role }) => {
      chamadas.push({ metodo: 'updateStage', dto, actorId: actor.id });
      assert.equal(actor.role, Role.admin);
      assert.equal(dto.omitTriagem, undefined);
      return {
        id,
        nome: 'Ana',
        telefone: '(81) 98888-7777',
        email: 'ana@email.com',
        origem: 'Site',
        interesse: 'Comprar',
        cidade: 'Recife',
        bairro: 'Boa Viagem',
        stage: dto.stage,
        funilId: 'funil-a',
        prioridade: 'Média',
        corretorId: null,
        corretor: null,
        cpf: '123',
        perdidoAt: dto.stage === 'perdido' ? new Date() : null,
        stageEnteredAt: new Date(),
        prazoDueAt: new Date(),
        createdAt: new Date('2026-11-07T12:00:00.000Z'),
        updatedAt: new Date('2026-11-07T13:00:00.000Z'),
      };
    },
  };
  const adapter = new ApiTecnicoAdapter(prisma as never);
  const service = new ApiLeadsService(prisma as never, leads as never, adapter);
  return { service, chamadas };
}

describe('PATCH /api/v1/leads/:id', () => {
  it('atualiza pelo LeadsService com o usuário técnico e esconde dados internos', async () => {
    const { service, chamadas } = cenario();
    const resposta = await service.atualizar(A, 'l1', { nome: 'Ana Lima', prioridade: 'Alta' });
    assert.equal(resposta.nome, 'Ana Lima');
    assert.equal('cpf' in resposta, false);
    assert.equal('perdidoAt' in resposta, false);
    assert.equal(chamadas[0].metodo, 'update');
    assert.equal(chamadas[0].actorId, 'tecnico-1');
    assert.equal('stage' in (chamadas[0].dto as object), false);
    assert.equal('corretorId' in (chamadas[0].dto as object), false);
    await service.atualizar(A, 'l1', { origem: null as unknown as string, email: null as unknown as string });
    const segundo = chamadas[1].dto as { origem?: string; email?: string | null };
    assert.equal(segundo.origem, '');
    assert.equal(segundo.email, null);
  });

  it('lead de outro tenant ou inexistente responde 404', async () => {
    const { service } = cenario();
    await assert.rejects(() => service.atualizar(B, 'l1', { nome: 'Ana' }), NotFoundException);
    await assert.rejects(() => service.atualizar(A, 'nao', { nome: 'Ana' }), NotFoundException);
  });

  it('recusa telefone, interesse, etapa, tenant e campos internos', async () => {
    const telefone = plainToInstance(AtualizarLeadApiDto, { telefone: '81988887777' });
    const interesse = plainToInstance(AtualizarLeadApiDto, { interesse: 'Alugar' });
    const extras = plainToInstance(AtualizarLeadApiDto, {
      nome: 'Ana',
      stage: 'contato',
      tenantId: B,
      actorId: 'admin',
      corretorId: 'c1',
      funilId: 'outro',
      cpf: '123',
    });
    assert.equal((await validate(telefone)).length > 0, true);
    assert.equal((await validate(interesse)).length > 0, true);
    const erros = await validate(extras, { whitelist: true, forbidNonWhitelisted: true });
    for (const campo of ['stage', 'tenantId', 'actorId', 'corretorId', 'funilId', 'cpf']) {
      assert.equal(erros.some((erro) => erro.property === campo), true);
    }
  });

  it('scope ausente responde 403', async () => {
    await assert.rejects(() => guard(['leads:read'], ['leads:update']), ForbiddenException);
  });
});

describe('POST /api/v1/leads/:id/move', () => {
  it('move pelo updateStage no funil atual e não devolve SLA', async () => {
    const { service, chamadas } = cenario();
    const resposta = await service.mover(A, 'l1', 'contato');
    assert.equal(resposta.stage, 'contato');
    assert.equal(resposta.funilId, 'funil-a');
    assert.equal('prazoDueAt' in resposta, false);
    assert.equal('stageEnteredAt' in resposta, false);
    assert.equal(chamadas[0].actorId, 'tecnico-1');
    assert.deepEqual(chamadas[0].dto, { stage: 'contato' });
  });

  it('etapa inexistente, inativa ou de outro funil é recusada sem chamar o CRM', async () => {
    const inativa = cenario({ etapaAtiva: false });
    await assert.rejects(() => inativa.service.mover(A, 'l1', 'contato'), BadRequestException);
    assert.equal(inativa.chamadas.length, 0);
    const outro = cenario();
    await assert.rejects(() => outro.service.mover(A, 'l1', 'ganho-venda'), BadRequestException);
    assert.equal(outro.chamadas.length, 0);
  });

  it('lead de outro tenant responde 404', async () => {
    const { service, chamadas } = cenario();
    await assert.rejects(() => service.mover(B, 'l1', 'contato'), NotFoundException);
    assert.equal(chamadas.length, 0);
  });

  it('etapa perdida delega ao CRM e a resposta não traz perdidoAt', async () => {
    const { service } = cenario();
    const prisma = (service as unknown as { prisma: { funilEtapa: { findFirst: () => Promise<{ id: string }> } } }).prisma;
    prisma.funilEtapa.findFirst = async () => ({ id: 'etapa-perdida' });
    const resposta = await service.mover(A, 'l1', 'perdido');
    assert.equal(resposta.stage, 'perdido');
    assert.equal('perdidoAt' in resposta, false);
  });

  it('recusa funil no corpo e scope ausente', async () => {
    const dto = plainToInstance(MoverLeadApiDto, { stage: 'contato', funilId: 'outro' });
    const erros = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    assert.equal(erros.some((erro) => erro.property === 'funilId'), true);
    await assert.rejects(() => guard(['leads:update'], ['funnels:write']), ForbiddenException);
  });
});

function guard(scopes: string[], required: string[]) {
  const access = new ApiAccessGuard(
    {
      authenticate: async () => ({
        sub: 'zc_abc',
        appId: 'app',
        tenantId: A,
        scopes,
        jti: 'j',
      }),
    } as never,
    { getAllAndOverride: () => required } as never,
  );
  return access.canActivate({
    switchToHttp: () => ({ getRequest: () => ({ header: () => 'Bearer token' }) }),
    getHandler: () => null,
    getClass: () => null,
  } as never);
}
