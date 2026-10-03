import { CaptacaoImovelTipo } from '@prisma/client';

export type MatchingImovel = {
  tipo: CaptacaoImovelTipo;
  cidade: string;
  bairro: string;
  quartos: number | null;
  banheiros: number | null;
  vagas: number | null;
  area: number | null;
  preco: number | null;
};

export type MatchingPreferencia = {
  tipoDesejado: CaptacaoImovelTipo | null;
  cidade: string;
  bairros: string;
  precoMin: number | null;
  precoMax: number | null;
  quartosMin: number | null;
  banheirosMin: number | null;
  vagasMin: number | null;
  areaMin: number | null;
};

function norm(value: string) {
  return value.trim().toLowerCase();
}

function splitBairros(raw: string): string[] {
  return raw
    .split(/[;,]/)
    .map((b) => norm(b))
    .filter(Boolean);
}

/** Compatibilidade por filtros. Sem score/IA. */
export function interessadoCompativel(
  imovel: MatchingImovel,
  pref: MatchingPreferencia,
): boolean {
  if (pref.tipoDesejado && pref.tipoDesejado !== imovel.tipo) return false;
  if (pref.cidade && norm(pref.cidade) !== norm(imovel.cidade)) return false;
  const bairros = splitBairros(pref.bairros);
  if (bairros.length && !bairros.includes(norm(imovel.bairro))) return false;
  if (
    pref.precoMax != null &&
    imovel.preco != null &&
    imovel.preco > pref.precoMax
  ) {
    return false;
  }
  if (
    pref.precoMin != null &&
    imovel.preco != null &&
    imovel.preco < pref.precoMin
  ) {
    return false;
  }
  if (pref.quartosMin != null && (imovel.quartos ?? 0) < pref.quartosMin) {
    return false;
  }
  if (pref.banheirosMin != null && (imovel.banheiros ?? 0) < pref.banheirosMin) {
    return false;
  }
  if (pref.vagasMin != null && (imovel.vagas ?? 0) < pref.vagasMin) {
    return false;
  }
  if (pref.areaMin != null && (imovel.area ?? 0) < pref.areaMin) return false;
  return true;
}

export function formatBrlHistorico(value: number | null): string {
  if (value == null) return '—';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export const VENDA_STATUS_LABEL: Record<string, string> = {
  disponivel: 'Disponível',
  reservado: 'Reservado',
  vendido: 'Vendido',
  indisponivel: 'Indisponível',
};

export const INTERESSE_STATUS_LABEL: Record<string, string> = {
  novo: 'Novo',
  em_contato: 'Em contato',
  interessado: 'Interessado',
  sem_interesse: 'Sem interesse',
  descartado: 'Descartado',
};

export const VISITA_STATUS_LABEL: Record<string, string> = {
  agendada: 'Agendada',
  confirmada: 'Confirmada',
  realizada: 'Realizada',
  cancelada: 'Cancelada',
  nao_compareceu: 'Não compareceu',
};

export const VISITA_INTERESSE_LABEL: Record<string, string> = {
  muito_interessado: 'Muito interessado',
  interessado: 'Interessado',
  pouco_interessado: 'Pouco interessado',
  sem_interesse: 'Sem interesse',
};

export const PROPOSTA_STATUS_LABEL: Record<string, string> = {
  rascunho: 'Rascunho',
  enviada: 'Enviada',
  em_analise: 'Em análise',
  aceita: 'Aceita',
  recusada: 'Recusada',
  cancelada: 'Cancelada',
};

export const NEGOCIACAO_STATUS_LABEL: Record<string, string> = {
  aberta: 'Aberta',
  em_negociacao: 'Em negociação',
  aceita: 'Aceita',
  recusada: 'Recusada',
  encerrada: 'Encerrada',
};

export const NEGOCIACAO_ORIGEM_LABEL: Record<string, string> = {
  interessado: 'Interessado',
  proprietario: 'Proprietário',
  corretor: 'Corretor',
  outro: 'Outro',
};

export const FECHAMENTO_STATUS_LABEL: Record<string, string> = {
  iniciado: 'Iniciado',
  documentacao_pendente: 'Documentação pendente',
  documentacao_em_analise: 'Documentação em análise',
  contrato_em_elaboracao: 'Contrato em elaboração',
  contrato_enviado: 'Contrato enviado',
  aguardando_assinatura: 'Aguardando assinatura',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
};

export const DOCUMENTO_STATUS_LABEL: Record<string, string> = {
  pendente: 'Pendente',
  recebido: 'Recebido',
  em_analise: 'Em análise',
  aprovado: 'Aprovado',
  recusado: 'Recusado',
};

export const DOCUMENTO_CATEGORIA_LABEL: Record<string, string> = {
  comprador: 'Comprador',
  proprietario: 'Proprietário',
  imovel: 'Imóvel',
  venda: 'Venda',
};

export const DOCUMENTO_FORNECEDOR_LABEL: Record<string, string> = {
  comprador: 'Comprador',
  proprietario: 'Proprietário',
  imobiliaria: 'Imobiliária',
};

export const CONTRATO_STATUS_LABEL: Record<string, string> = {
  rascunho: 'Rascunho',
  em_elaboracao: 'Em elaboração',
  enviado: 'Enviado',
  aguardando_assinatura: 'Aguardando assinatura',
  assinado: 'Assinado',
  cancelado: 'Cancelado',
};

export const CHAVE_STATUS_LABEL: Record<string, string> = {
  disponivel: 'Disponível',
  retirada: 'Retirada',
  devolvida: 'Devolvida',
  perdida: 'Perdida',
  inativa: 'Inativa',
};

export const CHAVE_LOCALIZACAO_LABEL: Record<string, string> = {
  imobiliaria: 'Imobiliária',
  corretor: 'Corretor',
  proprietario: 'Proprietário',
  comprador: 'Comprador',
  portaria: 'Portaria',
  caixa: 'Caixa de chaves',
  outro: 'Outro',
};

export const POS_VENDA_STATUS_LABEL: Record<string, string> = {
  pendente: 'Pendente',
  em_andamento: 'Em andamento',
  aguardando_pendencia: 'Aguardando pendência',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
};

export const POS_VENDA_PENDENCIA_STATUS_LABEL: Record<string, string> = {
  pendente: 'Pendente',
  em_andamento: 'Em andamento',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
};
