import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  FinanceiroDespesaNatureza,
  FinanceiroTituloStatus,
  FinanceiroTituloTipo,
} from '@prisma/client';

export class CreateTituloDto {
  @IsEnum(FinanceiroTituloTipo, { message: 'Tipo de título inválido.' })
  tipo!: FinanceiroTituloTipo;

  @IsString()
  @MinLength(2)
  @MaxLength(240)
  descricao!: string;

  @IsOptional()
  @IsUUID()
  parceiroId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  parceiroNome?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  categoria?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  centro?: string;

  @IsDateString({}, { message: 'Vencimento inválido.' })
  vencimento!: string;

  @Type(() => Number)
  @IsNumber({}, { message: 'Valor inválido.' })
  valor!: number;

  @IsOptional()
  @IsEnum(FinanceiroTituloStatus)
  status?: FinanceiroTituloStatus;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  parcela?: string;

  @IsOptional()
  @IsUUID('4')
  platformContratoId?: string;

  @IsOptional()
  @IsEnum(FinanceiroDespesaNatureza, {
    message: 'Natureza inválida. Use fixa ou variavel.',
  })
  natureza?: FinanceiroDespesaNatureza;
}
