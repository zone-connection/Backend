import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { PERIODO_GRANULARIDADES, type PeriodoGranularidade } from '../../common/utils/periodo-brasil';

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
}
