import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, Max, Min } from "class-validator";
import {
  PERIODO_GRANULARIDADES,
  type PeriodoGranularidade,
} from "../../common/utils/periodo-brasil";

export class QueryVendasPeriodoDto {
  @IsOptional()
  @IsIn(PERIODO_GRANULARIDADES)
  granularidade?: PeriodoGranularidade;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  mes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  ano?: number;
}
