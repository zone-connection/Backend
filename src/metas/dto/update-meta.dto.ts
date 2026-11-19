import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { META_PERIODOS, META_TIPOS } from './create-meta.dto';

export class UpdateMetaDto {
  @IsInt({ message: 'O valor da meta deve ser um número inteiro.' })
  @Min(1, { message: 'O valor da meta deve ser maior que zero.' })
  valor!: number;

  @IsOptional()
  @IsString({ message: 'Informe o título da meta.' })
  @MinLength(2, { message: 'O título deve ter pelo menos 2 caracteres.' })
  @MaxLength(80, { message: 'O título deve ter no máximo 80 caracteres.' })
  titulo?: string;

  @IsOptional()
  @IsIn(META_TIPOS, { message: 'Indicador de meta inválido.' })
  tipo?: (typeof META_TIPOS)[number];

  @IsOptional()
  @IsIn(META_PERIODOS, { message: 'Período de meta inválido.' })
  periodo?: (typeof META_PERIODOS)[number];
}
