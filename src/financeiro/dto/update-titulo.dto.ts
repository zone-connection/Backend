import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  FinanceiroDespesaNatureza,
  FinanceiroTituloStatus,
  FinanceiroTituloTipo,
} from '@prisma/client';

export class UpdateTituloDto {
  @IsOptional()
  @IsEnum(FinanceiroTituloTipo, { message: 'Tipo de título inválido.' })
  tipo?: FinanceiroTituloTipo;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(240)
  descricao?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  parceiroId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  parceiroNome?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  categoria?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  centro?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Vencimento inválido.' })
  vencimento?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Valor inválido.' })
  valor?: number;

  @IsOptional()
  @IsEnum(FinanceiroTituloStatus)
  status?: FinanceiroTituloStatus;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  parcela?: string;

  @IsOptional()
  @IsEnum(FinanceiroDespesaNatureza, {
    message: 'Natureza inválida. Use fixa ou variavel.',
  })
  natureza?: FinanceiroDespesaNatureza | null;
}
