import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { LembretePessoalRecorrencia } from '@prisma/client';

export class CreateLembreteDto {
  @IsString()
  @MinLength(1, { message: 'Informe o título do lembrete.' })
  @MaxLength(120)
  titulo!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  descricao?: string;

  @IsOptional()
  @IsEnum(LembretePessoalRecorrencia, {
    message: 'Recorrência inválida.',
  })
  recorrencia?: LembretePessoalRecorrencia;
}

export class UpdateLembreteDto {
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'Informe o título do lembrete.' })
  @MaxLength(120)
  titulo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  descricao?: string;

  @IsOptional()
  @IsEnum(LembretePessoalRecorrencia, {
    message: 'Recorrência inválida.',
  })
  recorrencia?: LembretePessoalRecorrencia;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
