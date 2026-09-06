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
  construtoraId: true,
  construtora: { select: { id: true, nome: true, cor: true } },
  empreendimentoId: true,
  empreendimento: { select: { id: true, nome: true, cidade: true } },
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
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.LeadSelect;

/** Sem colunas novas — listagem/login continuam se a migration ainda não rodou. */
export const leadSelectSafe = {
  ...leadSelect,
  cpf: false,
  rg: false,
  endereco: false,
  cep: false,
  corretor: { select: { id: true, name: true } },
} satisfies Prisma.LeadSelect;

export type LeadEntity = Prisma.LeadGetPayload<{ select: typeof leadSelect }>;

export function activeLeadSelect(hasContratoCols: boolean) {
  return hasContratoCols ? leadSelect : leadSelectSafe;
}

export function normalizeLeadEntity(row: Record<string, unknown>): LeadEntity {
  const corretor = row.corretor as
    | {
        id: string;
        name: string;
        email?: string | null;
        phone?: string | null;
        creci?: string | null;
        cpf?: string | null;
        rg?: string | null;
        endereco?: string | null;
        cep?: string | null;
      }
    | null
    | undefined;
  return {
    ...(row as LeadEntity),
    cpf: (row.cpf as string | null | undefined) ?? null,
    rg: (row.rg as string | null | undefined) ?? null,
    endereco: (row.endereco as string | null | undefined) ?? null,
    cep: (row.cep as string | null | undefined) ?? null,
    corretor: corretor
      ? {
          id: corretor.id,
          name: corretor.name,
          email: corretor.email ?? null,
          phone: corretor.phone ?? null,
          creci: corretor.creci ?? null,
          cpf: corretor.cpf ?? null,
          rg: corretor.rg ?? null,
          endereco: corretor.endereco ?? null,
          cep: corretor.cep ?? null,
        }
      : null,
  };
}
