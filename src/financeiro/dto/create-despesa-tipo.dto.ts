import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { FinanceiroDespesaNatureza } from '@prisma/client';

export class CreateDespesaTipoDto {
  @IsString()
  @MinLength(2, { message: 'O nome deve ter ao menos 2 caracteres.' })
  @MaxLength(120)
  nome!: string;

  @IsEnum(FinanceiroDespesaNatureza, {
    message: 'Natureza inválida. Use fixa, fixa_variavel ou variavel.',
  })
  natureza!: FinanceiroDespesaNatureza;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Orçamento mensal inválido.' })
  @Min(0)
  orcadoMensal?: number;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
