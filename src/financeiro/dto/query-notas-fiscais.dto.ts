import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class QueryNotasFiscaisDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @IsOptional()
  @IsIn(['mes', 'trimestre', 'ano', 'tudo'])
  periodo?: 'mes' | 'trimestre' | 'ano' | 'tudo';

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  de?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  ate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  corretor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  construtora?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  empreendimento?: string;

  @IsOptional()
  @IsIn(['com', 'sem'])
  arquivo?: 'com' | 'sem';
}
