import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { FinanceiroMovimentoTipo } from '@prisma/client';

export class UpdateCategoriaDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'O nome deve ter ao menos 2 caracteres.' })
  @MaxLength(120)
  nome?: string;

  @IsOptional()
  @IsEnum(FinanceiroMovimentoTipo, { message: 'Tipo de categoria inválido.' })
  tipo?: FinanceiroMovimentoTipo;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
