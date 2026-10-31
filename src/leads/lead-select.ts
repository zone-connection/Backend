import { Prisma } from '@prisma/client';

/** Campos de lead retornados pela API, incluindo o corretor dono (id + nome). */
export const leadSelect = {
  id: true,
  tipo: true,
  nome: true,
  telefone: true,
  email: true,
  origem: true,
  interesse: true,
  cidade: true,
  bairro: true,
  stage: true,
  prioridade: true,
  renda: true,
  tipoRenda: true,
  estadoCivil: true,
  cpf: true,
  rg: true,
  endereco: true,
  cep: true,
  orcamentoMax: true,
  quartosMin: true,
  vagasMin: true,
  prospeccao: true,
  tags: true,
  corretorId: true,
  corretor: {
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      creci: true,
      cpf: true,
      rg: true,
      endereco: true,
      cep: true,
    },
  },
  equipeId: true,
  equipe: { select: { id: true, name: true } },
  funilId: true,
  construtoraId: true,
  construtora: { select: { id: true, nome: true, cor: true } },
  empreendimentoId: true,
  empreendimento: { select: { id: true, nome: true, cidade: true } },
  interessesEmpreendimento: {
    orderBy: [{ removidoEm: 'asc' }, { dataInteresse: 'desc' }],
    select: {
      id: true,
      empreendimentoId: true,
      imovelId: true,
      status: true,
      observacoes: true,
      corretorId: true,
      dataInteresse: true,
      ultimaInteracao: true,
      removidoEm: true,
      createdAt: true,
      updatedAt: true,
      corretor: { select: { id: true, name: true } },
      empreendimento: { select: { id: true, nome: true, cidade: true } },
      imovel: {
        select: {
          id: true,
          logradouro: true,
          numero: true,
          bairro: true,
          cidade: true,
        },
      },
    },
  },
  analise: {
    select: {
      id: true,
      status: true,
      parecer: true,
      analistaId: true,
      analista: { select: { id: true, name: true } },
    },
  },
  /** Parecer de crédito mais recente (Status 1 da documentação). */
  documentacoes: {
    orderBy: { updatedAt: 'desc' },
    take: 1,
    select: {
      id: true,
      status1: true,
      status2: true,
      vgv: true,
      updatedAt: true,
    },
  },
  perdidoAt: true,
  motivoPerda: true,
  perdidoPorId: true,
  perdidoPor: { select: { id: true, name: true } },
  stageEnteredAt: true,
  lastMovementAt: true,
  lastStageChangeAt: true,
  lastTriagemAt: true,
  lastTarefaAt: true,
  lastAtividadeAt: true,
  prazoDueAt: true,
  alertaProximoAt: true,
  prazoAdiado: true,
  roletaRedistribuido: true,
  origemAtrasoLiberacao: true,
  atrasoLiberadoAt: true,
  triagemOrigemHerdada: true,
  createdAt: true,
  updatedAt: true,
  metaLink: {
    select: {
      leadgenId: true,
      pageId: true,
      formId: true,
      adId: true,
      adgroupId: true,
    },
  },
  grupoZapLink: {
    select: {
      leadOrigin: true,
      originListingId: true,
      clientListingId: true,
      leadType: true,
    },
  },
} satisfies Prisma.LeadSelect;

export type LeadEntity = Prisma.LeadGetPayload<{ select: typeof leadSelect }>;

/** Completa campanha/custo sem derrubar a lista se a migration ainda não rodou. */
export async function hydrateLeadAquisicao<
  T extends { id: string; metaLink: LeadEntity['metaLink'] },
>(
  prisma: {
    leadMetaLink: {
      findMany: (args: unknown) => Promise<
        Array<{
          leadId: string;
          campaignId: string | null;
          campaignName: string | null;
          adName: string | null;
          formName: string | null;
          costPerLead: unknown;
          costCurrency: string | null;
          adId: string | null;
          formId: string | null;
        }>
      >;
    };
  },
  leads: T[],
): Promise<T[]> {
  const ids = leads.map((lead) => lead.id);
  if (!ids.length) return leads;
  try {
    const rows = await prisma.leadMetaLink.findMany({
      where: { leadId: { in: ids } },
      select: {
        leadId: true,
        campaignId: true,
        campaignName: true,
        adName: true,
        formName: true,
        costPerLead: true,
        costCurrency: true,
        adId: true,
        formId: true,
      },
    });
    const byLead = new Map(rows.map((row) => [row.leadId, row]));
    return leads.map((lead) => {
      const extra = byLead.get(lead.id);
      if (!extra || !lead.metaLink) return lead;
      const cost = Number(extra.costPerLead);
      return {
        ...lead,
        metaLink: {
          ...lead.metaLink,
          campaignId: extra.campaignId,
          campaignName: extra.campaignName,
          adName: extra.adName,
          formName: extra.formName,
          costPerLead: Number.isFinite(cost) ? cost : null,
          costCurrency: extra.costCurrency,
          adId: extra.adId ?? lead.metaLink.adId,
          formId: extra.formId ?? lead.metaLink.formId,
        },
      };
    });
  } catch {
    return leads;
  }
}
