/**
 * Etapas padrão do funil de vendas (imobiliário).
 * Persistidas em `funil_etapas` — o slug é o identificador estável usado em Lead.stage.
 * `papel` dispara fluxos (análise, venda, perda) independente do label.
 */
export const DEFAULT_INITIAL_STAGE_SLUG = 'novo';

export type DefaultFunnelPapel = 'inicial' | 'analise' | 'venda' | 'perdido';

export interface DefaultFunnelStage {
  label: string;
  slug: string;
  color: string;
  sortOrder: number;
  papel?: DefaultFunnelPapel;
}

export const DEFAULT_FUNNEL_STAGES: readonly DefaultFunnelStage[] = [
  {
    label: 'Novo lead',
    slug: DEFAULT_INITIAL_STAGE_SLUG,
    color: 'bg-slate-200 text-slate-700',
    sortOrder: 0,
    papel: 'inicial',
  },
  {
    label: 'Contato',
    slug: 'contato',
    color: 'bg-blue-100 text-blue-700',
    sortOrder: 1,
  },
  {
    label: 'Qualificação',
    slug: 'qualificacao',
    color: 'bg-indigo-100 text-indigo-700',
    sortOrder: 2,
  },
  {
    label: 'Em análise',
    slug: 'em-analise',
    color: 'bg-violet-100 text-violet-700',
    sortOrder: 3,
    papel: 'analise',
  },
  {
    label: 'Visita agendada',
    slug: 'visita-agendada',
    color: 'bg-cyan-100 text-cyan-700',
    sortOrder: 4,
  },
  {
    label: 'Visita realizada',
    slug: 'visita-realizada',
    color: 'bg-teal-100 text-teal-700',
    sortOrder: 5,
  },
  {
    label: 'Proposta',
    slug: 'proposta',
    color: 'bg-amber-100 text-amber-700',
    sortOrder: 6,
  },
  {
    label: 'Negociação',
    slug: 'negociacao',
    color: 'bg-orange-100 text-orange-700',
    sortOrder: 7,
  },
  {
    label: 'Contrato / Fechamento',
    slug: 'contrato-fechamento',
    color: 'bg-emerald-100 text-emerald-700',
    sortOrder: 8,
  },
  {
    label: 'Ganho / Venda',
    slug: 'ganho-venda',
    color: 'bg-green-200 text-green-800',
    sortOrder: 9,
    papel: 'venda',
  },
  {
    label: 'Perdido',
    slug: 'perdido',
    color: 'bg-red-100 text-red-700',
    sortOrder: 10,
    papel: 'perdido',
  },
] as const;

/** Tipo de operação do funil (espelha o enum Prisma FunilTipo). */
export type FunilOperacaoTipo = 'comercial' | 'captacao' | 'venda_usados';

export const DEFAULT_FUNIL_NAME: Record<FunilOperacaoTipo, string> = {
  comercial: 'Funil padrão',
  captacao: 'Funil de Captação',
  venda_usados: 'Funil de Venda de Usados',
};

export const DEFAULT_CAPTATION_FUNNEL_STAGES: readonly DefaultFunnelStage[] = [
  {
    label: 'Novo proprietário',
    slug: 'novo-proprietario',
    color: 'bg-slate-200 text-slate-700',
    sortOrder: 0,
    papel: 'inicial',
  },
  {
    label: 'Primeiro contato',
    slug: 'primeiro-contato',
    color: 'bg-blue-100 text-blue-700',
    sortOrder: 1,
  },
  {
    label: 'Avaliação',
    slug: 'avaliacao',
    color: 'bg-indigo-100 text-indigo-700',
    sortOrder: 2,
  },
  {
    label: 'Negociação',
    slug: 'negociacao-captacao',
    color: 'bg-amber-100 text-amber-700',
    sortOrder: 3,
  },
  {
    label: 'Aguardando documentação',
    slug: 'aguardando-documentacao',
    color: 'bg-violet-100 text-violet-700',
    sortOrder: 4,
  },
  {
    label: 'Captação aprovada',
    slug: 'captacao-aprovada',
    color: 'bg-teal-100 text-teal-700',
    sortOrder: 5,
  },
  {
    label: 'Imóvel captado',
    slug: 'imovel-captado',
    color: 'bg-green-200 text-green-800',
    sortOrder: 6,
    papel: 'venda',
  },
  {
    label: 'Captação perdida',
    slug: 'captacao-perdida',
    color: 'bg-red-100 text-red-700',
    sortOrder: 7,
    papel: 'perdido',
  },
] as const;

export const DEFAULT_VENDA_USADOS_FUNNEL_STAGES: readonly DefaultFunnelStage[] =
  [
    {
      label: 'Novo interessado',
      slug: 'novo-interessado',
      color: 'bg-slate-200 text-slate-700',
      sortOrder: 0,
      papel: 'inicial',
    },
    {
      label: 'Qualificação',
      slug: 'qualificacao-usados',
      color: 'bg-indigo-100 text-indigo-700',
      sortOrder: 1,
    },
    {
      label: 'Imóvel apresentado',
      slug: 'imovel-apresentado',
      color: 'bg-blue-100 text-blue-700',
      sortOrder: 2,
    },
    {
      label: 'Visita agendada',
      slug: 'visita-agendada-usados',
      color: 'bg-cyan-100 text-cyan-700',
      sortOrder: 3,
    },
    {
      label: 'Visita realizada',
      slug: 'visita-realizada-usados',
      color: 'bg-teal-100 text-teal-700',
      sortOrder: 4,
    },
    {
      label: 'Proposta',
      slug: 'proposta-usados',
      color: 'bg-amber-100 text-amber-700',
      sortOrder: 5,
    },
    {
      label: 'Negociação',
      slug: 'negociacao-usados',
      color: 'bg-orange-100 text-orange-700',
      sortOrder: 6,
    },
    {
      label: 'Venda',
      slug: 'venda-usados',
      color: 'bg-green-200 text-green-800',
      sortOrder: 7,
      papel: 'venda',
    },
    {
      label: 'Perdido',
      slug: 'perdido-usados',
      color: 'bg-red-100 text-red-700',
      sortOrder: 8,
      papel: 'perdido',
    },
  ] as const;

export function defaultStagesForTipo(
  tipo: FunilOperacaoTipo,
): readonly DefaultFunnelStage[] {
  if (tipo === 'captacao') return DEFAULT_CAPTATION_FUNNEL_STAGES;
  if (tipo === 'venda_usados') return DEFAULT_VENDA_USADOS_FUNNEL_STAGES;
  return DEFAULT_FUNNEL_STAGES;
}

export function funilEtapasCreateData(tipo: FunilOperacaoTipo) {
  return defaultStagesForTipo(tipo).map((s) => ({
    label: s.label,
    slug: s.slug,
    color: s.color,
    sortOrder: s.sortOrder,
    active: true,
    papel: (s.papel ?? null) as DefaultFunnelPapel | null,
  }));
}

export interface DefaultCatalogLabel {
  label: string;
  color: string;
}

/** Fontes padrão da documentação (analista / módulo Documentação). */
export const DEFAULT_DOCUMENTACAO_FONTES: readonly DefaultCatalogLabel[] = [
  { label: 'Indicação', color: 'bg-emerald-100 text-emerald-700' },
  { label: 'Lead próprio', color: 'bg-blue-100 text-blue-700' },
  { label: 'Lista', color: 'bg-indigo-100 text-indigo-700' },
  { label: 'Campanha', color: 'bg-amber-100 text-amber-700' },
  { label: 'Outro', color: 'bg-slate-200 text-slate-700' },
] as const;

export const DEFAULT_DOCUMENTACAO_STATUS1: readonly DefaultCatalogLabel[] = [
  { label: 'Em análise', color: 'bg-indigo-100 text-indigo-700' },
  { label: 'Aprovado', color: 'bg-green-100 text-green-700' },
  { label: 'Aprovado c/ restrição', color: 'bg-amber-100 text-amber-700' },
] as const;

export const DEFAULT_DOCUMENTACAO_STATUS2: readonly DefaultCatalogLabel[] = [
  { label: 'Vendido', color: 'bg-green-200 text-green-800' },
  { label: 'Bacen', color: 'bg-sky-100 text-sky-700' },
  { label: 'Andamento', color: 'bg-orange-100 text-orange-700' },
] as const;

/** Motivos padrão de perda de lead. */
export const DEFAULT_MOTIVOS_PERDA: readonly DefaultCatalogLabel[] = [
  { label: 'Sem retorno', color: 'bg-slate-200 text-slate-700' },
  { label: 'Comprou com concorrente', color: 'bg-orange-100 text-orange-700' },
  { label: 'Crédito não aprovado', color: 'bg-red-100 text-red-700' },
  { label: 'Fora do perfil financeiro', color: 'bg-amber-100 text-amber-700' },
  { label: 'Contato inválido', color: 'bg-rose-100 text-rose-700' },
  { label: 'Desistiu da compra', color: 'bg-violet-100 text-violet-700' },
  { label: 'Sem interesse', color: 'bg-indigo-100 text-indigo-700' },
] as const;

export const DEFAULT_EMPREENDIMENTO_TIPOS: readonly DefaultCatalogLabel[] = [
  { label: 'Vertical', color: 'bg-blue-100 text-blue-700' },
  { label: 'Casa', color: 'bg-emerald-100 text-emerald-700' },
  { label: 'Loteamento', color: 'bg-amber-100 text-amber-700' },
  { label: 'Comercial', color: 'bg-violet-100 text-violet-700' },
] as const;

export const DEFAULT_EMPREENDIMENTO_STATUS: readonly DefaultCatalogLabel[] = [
  { label: 'Lançamento', color: 'bg-sky-100 text-sky-700' },
  { label: 'Em obras', color: 'bg-orange-100 text-orange-700' },
  { label: 'Pronto', color: 'bg-green-100 text-green-700' },
] as const;

export const DEFAULT_EMPREENDIMENTO_TAGS: readonly DefaultCatalogLabel[] = [
  { label: 'Litoral', color: 'bg-cyan-100 text-cyan-700' },
  { label: 'FGTS', color: 'bg-indigo-100 text-indigo-700' },
  { label: 'MCMV', color: 'bg-teal-100 text-teal-700' },
  { label: 'Caixa', color: 'bg-slate-200 text-slate-700' },
] as const;
