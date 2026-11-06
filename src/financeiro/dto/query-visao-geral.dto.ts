import { Type } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";

export class QueryVisaoGeralDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  ano?: number;

  /** 1–12. Sem valor = ano inteiro. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  mes?: number;
}
