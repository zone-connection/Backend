import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { PERIODO_GRANULARIDADES, type PeriodoGranularidade } from '../../common/utils/periodo-brasil';

export const RANKING_FAIXAS = [
  'hoje',
  'semana',
  'mes',
  'trimestre',
  'ano',
  'personalizado',
] as const;
export type RankingFaixa = (typeof RANKING_FAIXAS)[number];

export const RANKING_CATEGORIAS = [
  'lancamentos',
  'documentacoes',
  'captacoes',
  'visitas',
  'vendas_usados',
  'locacoes',
] as const;
export type RankingCategoria = (typeof RANKING_CATEGORIAS)[number];

export class QueryDashboardDto {
  /** Recorte: mês, bimestre, trimestre, semestre ou ano. Omite = mês. */
  @IsOptional()
  @IsIn(PERIODO_GRANULARIDADES)
  granularidade?: PeriodoGranularidade;

  /** Mês calendário (1–12). Omite = mês atual (timezone BR). Alinha ao início do recorte. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  mes?: number;

  /** Ano calendário. Omite = ano atual (timezone BR). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  ano?: number;

  /** Filtra por origem do lead (valor do catálogo). */
  @IsOptional()
  @IsString()
  origem?: string;

  /** Recorte rápido do ranking (hoje, semana, mês…). */
  @IsOptional()
  @IsIn(RANKING_FAIXAS)
  faixa?: RankingFaixa;

  /** Início do período personalizado (YYYY-MM-DD, calendário BR). */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Data inicial inválida.' })
  de?: string;

  /** Fim do período personalizado (YYYY-MM-DD, calendário BR, inclusivo). */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Data final inválida.' })
  ate?: string;

  /** Categoria do ranking. Omite = lançamentos (ranking atual). */
  @IsOptional()
  @IsIn(RANKING_CATEGORIAS)
  categoria?: RankingCategoria;
}
