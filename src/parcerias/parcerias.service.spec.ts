import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ParceriaParticipacaoStatus, ParceriaStatus } from '@prisma/client';
import { ParceriasService } from './parcerias.service';

const session = {
  parceiroId: 'parceiro-1',
  email: 'parceiro@ex.com',
  name: 'Ana',
};

describe('parcerias — vitrine e PII', () => {
  it('vitrine não devolve dados do proprietário', async () => {
    const prisma = {
      parceria: {
        findMany: async () => [
          {
            id: 'par-1',
            tenantId: 't1',
            status: ParceriaStatus.ativa,
            podeVerEstoque: true,
          },
        ],
      },
      imovel: {
        findMany: async () => [
          {
            id: 'imv-1',
            tenantId: 't1',
            tipo: 'Apartamento',
            logradouro: 'Rua A',
            numero: '10',
            bairro: 'Centro',
            cidade: 'SP',
            estado: 'SP',
            descricao: 'Apto',
            fotoUrl: null,
            quartos: 2,
            vagas: 1,
            area: 70,
            tenant: { name: 'Imobiliária X' },
            vendaUsado: { precoVenda: 500000, status: 'ativo' },
            proprietarioId: 'should-not-leak',
            proprietario: { nome: 'Dono', telefone: '119999' },
          },
        ],
      },
    };
    const service = new ParceriasService(
      prisma as never,
      {} as never,
      {} as never,
    );
    const rows = await service.vitrine(session);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].endereco, 'Rua A, 10');
    assert.equal('proprietario' in rows[0], false);
    assert.equal('proprietarioId' in rows[0], false);
  });

  it('mascara telefone e e-mail até aceitar a oportunidade', async () => {
    const prisma = {
      parceria: {
        findMany: async () => [{ id: 'par-1', status: ParceriaStatus.ativa }],
      },
      parceriaParticipacao: {
        findMany: async () => [
          {
            id: 'part-1',
            parceriaId: 'par-1',
            status: ParceriaParticipacaoStatus.pendente,
            expiresAt: new Date(Date.now() + 86_400_000),
            lead: {
              id: 'lead-1',
              nome: 'Cliente',
              telefone: '11988887777',
              email: 'cli@ex.com',
              cidade: 'SP',
              bairro: 'Pinheiros',
              stage: 'novo',
              origem: 'Parceria',
            },
            parceria: { tenant: { name: 'Imobiliária X' } },
          },
        ],
      },
    };
    const service = new ParceriasService(
      prisma as never,
      {} as never,
      {} as never,
    );
    const rows = await service.oportunidades(session);
    assert.equal(rows[0].lead.telefone, null);
    assert.equal(rows[0].lead.email, null);
    assert.equal(rows[0].lead.nome, 'Cliente');
  });
});
