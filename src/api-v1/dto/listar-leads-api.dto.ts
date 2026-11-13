import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { LEAD_CATEGORIAS } from '../../leads/lead.constants';

export const LEADS_API_SORTS = [
  'created_desc',
  'created_asc',
  'nome_asc',
  'nome_desc',
] as const;

export type LeadsApiSort = (typeof LEADS_API_SORTS)[number];

export class ListarLeadsApiDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  stage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  origem?: string;

  @IsOptional()
  @IsIn(LEAD_CATEGORIAS, { message: 'Categoria inválida. Use aluguel ou potencial.' })
  categoria?: 'aluguel' | 'potencial';

  @IsOptional()
  @IsIn(LEADS_API_SORTS, {
    message: 'Ordenação inválida. Use created_desc, created_asc, nome_asc ou nome_desc.',
  })
  sort?: LeadsApiSort = 'created_desc';
}
