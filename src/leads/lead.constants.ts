/**
 * Valores aceitos para os campos categóricos de Lead.
 * Mantêm paridade exata com os identificadores do frontend (mock-data.ts),
 * por isso preservam hífens e acentos — o banco guarda o valor como String.
 */

export const LEAD_STAGES = [
  'novo',
  'contato',
  'qualificacao',
  'visita-agendada',
  'visita-realizada',
  'proposta',
  'negociacao',
  'contrato',
  'venda',
  'perdido',
] as const;

export type LeadStage = (typeof LEAD_STAGES)[number];

export const LEAD_INTERESSES = ['Comprar'] as const;

export type LeadInteresse = (typeof LEAD_INTERESSES)[number];

export const LEAD_CATEGORIAS = ['aluguel', 'potencial'] as const;

export type LeadCategoria = (typeof LEAD_CATEGORIAS)[number];

export const LEAD_PRIORIDADES = ['Alta', 'Média', 'Baixa'] as const;

export type LeadPrioridade = (typeof LEAD_PRIORIDADES)[number];

/** lead = captação; cliente = carteira pessoal (não mistura nas listas). */
export const CONTATO_TIPOS = ['lead', 'cliente'] as const;

export type ContatoTipo = (typeof CONTATO_TIPOS)[number];
