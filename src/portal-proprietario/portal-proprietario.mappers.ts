import {
  CaptacaoHistoricoTipo,
  VendaUsadoHistoricoTipo,
} from '@prisma/client';
import { imovelTitulo } from '../captacao/captacao.constants';
import { toMoneyNumber } from '../captacao/captacao.util';

export const CAPTACAO_HISTORICO_PORTAL: CaptacaoHistoricoTipo[] = [
  CaptacaoHistoricoTipo.criacao,
  CaptacaoHistoricoTipo.etapa,
  CaptacaoHistoricoTipo.valor,
  CaptacaoHistoricoTipo.exclusividade,
  CaptacaoHistoricoTipo.portal_acao,
  CaptacaoHistoricoTipo.edicao,
  CaptacaoHistoricoTipo.cancelamento,
];

export const VENDA_HISTORICO_PORTAL: VendaUsadoHistoricoTipo[] = [
  VendaUsadoHistoricoTipo.disponibilizacao,
  VendaUsadoHistoricoTipo.responsavel,
  VendaUsadoHistoricoTipo.status,
  VendaUsadoHistoricoTipo.preco,
  VendaUsadoHistoricoTipo.etapa,
  VendaUsadoHistoricoTipo.interessado_vinculo,
  VendaUsadoHistoricoTipo.interessado_remocao,
  VendaUsadoHistoricoTipo.visita,
  VendaUsadoHistoricoTipo.visita_feedback,
  VendaUsadoHistoricoTipo.proposta,
  VendaUsadoHistoricoTipo.negociacao,
  VendaUsadoHistoricoTipo.fechamento,
  VendaUsadoHistoricoTipo.documentacao,
  VendaUsadoHistoricoTipo.contrato,
  VendaUsadoHistoricoTipo.chave,
  VendaUsadoHistoricoTipo.pos_venda,
  VendaUsadoHistoricoTipo.portal_acao,
];

export type SituacaoPortal =
  | 'sem_operacao'
  | 'captacao'
  | 'disponivel'
  | 'negociacao'
  | 'vendido'
  | 'indisponivel';

export function money(value: unknown): number | null {
  return toMoneyNumber(value as never);
}

export function tituloImovel(imovel: {
  tipo: Parameters<typeof imovelTitulo>[0]['tipo'];
  logradouro: string;
  numero: string;
  bairro: string;
  cidade: string;
}): string {
  return imovelTitulo(imovel);
}

export function situacaoImovel(opts: {
  temCaptacao: boolean;
  vendaStatus?: string | null;
  propostasAbertas?: number;
}): SituacaoPortal {
  if (opts.vendaStatus === 'vendido') return 'vendido';
  if (opts.vendaStatus === 'indisponivel') return 'indisponivel';
  if (opts.vendaStatus === 'reservado') return 'negociacao';
  if (opts.vendaStatus === 'disponivel') {
    return (opts.propostasAbertas ?? 0) > 0 ? 'negociacao' : 'disponivel';
  }
  if (opts.temCaptacao) return 'captacao';
  return 'sem_operacao';
}

export function proximoPasso(opts: {
  situacao: SituacaoPortal;
  etapaCaptacao?: string | null;
  exclusividade?: boolean;
  etapaVenda?: string | null;
  canceladoPeloProprietario?: boolean;
}): string {
  if (opts.canceladoPeloProprietario) {
    return 'Você cancelou o anúncio. A imobiliária pode entrar em contato ou registrar a perda.';
  }
  if (opts.situacao === 'captacao') {
    const etapa = opts.etapaCaptacao ? ` (${opts.etapaCaptacao})` : '';
    if (!opts.exclusividade) {
      return `Em captação${etapa} — a imobiliária está avaliando / aguardando exclusividade.`;
    }
    return `Em captação${etapa} — a imobiliária segue com a captação em exclusividade.`;
  }
  if (opts.situacao === 'disponivel') {
    return opts.etapaVenda
      ? `À venda (${opts.etapaVenda}) — a imobiliária está divulgando o imóvel.`
      : 'À venda — a imobiliária está divulgando o imóvel.';
  }
  if (opts.situacao === 'negociacao') {
    return opts.etapaVenda
      ? `Em negociação (${opts.etapaVenda}) — há proposta ou reserva em andamento.`
      : 'Em negociação — há proposta ou reserva em andamento.';
  }
  if (opts.situacao === 'vendido') {
    return 'Vendido — acompanhe documentação, contrato e chaves nesta ficha.';
  }
  if (opts.situacao === 'indisponivel') {
    return 'Indisponível no momento. Fale com o corretor se precisar de mais detalhes.';
  }
  return 'A imobiliária ainda não iniciou a operação deste imóvel.';
}
