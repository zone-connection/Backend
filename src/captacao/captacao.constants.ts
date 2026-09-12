import { CaptacaoImovelTipo } from '@prisma/client';

export const CAPTACAO_ORIGENS_PADRAO = [
  'indicação',
  'site',
  'instagram',
  'facebook',
  'portal',
  'telefone',
  'whatsapp',
  'prospecção',
  'cliente existente',
  'outro',
] as const;

export const CAPTACAO_IMOVEL_TIPO_LABEL: Record<CaptacaoImovelTipo, string> = {
  apartamento: 'Apartamento',
  casa: 'Casa',
  terreno: 'Terreno',
  sala_comercial: 'Sala comercial',
  loja: 'Loja',
  galpao: 'Galpão',
  fazenda: 'Fazenda',
  chacara: 'Chácara',
  outro: 'Outro',
};

export function imovelTitulo(imovel: {
  tipo: CaptacaoImovelTipo;
  logradouro: string;
  numero: string;
  bairro: string;
  cidade: string;
}): string {
  const tipo = CAPTACAO_IMOVEL_TIPO_LABEL[imovel.tipo] ?? imovel.tipo;
  const rua = [imovel.logradouro, imovel.numero].filter(Boolean).join(', ');
  const local = [imovel.bairro, imovel.cidade].filter(Boolean).join(', ');
  return [tipo, rua || local].filter(Boolean).join(' — ');
}

/** Características da unidade (além de quartos/suítes/vagas). */
export const IMOVEL_COMODIDADES_UNIDADE = [
  'Sala para 2 ambientes',
  'Vestíbulo',
  'Rooftop',
  'Piscina privativa',
  'Varanda',
  'Cozinha',
  'Área de serviço',
  'Closet',
  'Escritório',
  'DCE',
  'Mobiliado',
  'Ar-condicionado',
] as const;

/** Lazer e infraestrutura do condomínio. */
export const IMOVEL_COMODIDADES_CONDOMINIO = [
  'Academia',
  'Brinquedoteca',
  'Cinema',
  'Espaço gourmet',
  'Piscina adulto',
  'Piscina infantil',
  'Playground',
  'Salão de festas',
  'Salão de jogos',
  'Câmeras de segurança',
  'Portão eletrônico',
  'Portaria 24h',
  'Elevador',
  'Quadra',
  'Sauna',
  'Pet place',
  'Bicicletário',
] as const;
