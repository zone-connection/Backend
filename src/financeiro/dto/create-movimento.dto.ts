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
  FinanceiroMovimentoTipo,
  FinanceiroTituloStatus,
} from '@prisma/client';

export class CreateMovimentoDto {
  @IsDateString({}, { message: 'Data inválida.' })
  data!: string;

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

  @IsString()
  @MaxLength(120)
  categoria!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  centro?: string;

  @IsEnum(FinanceiroMovimentoTipo, { message: 'Tipo de movimento inválido.' })
  tipo!: FinanceiroMovimentoTipo;

  @Type(() => Number)
  @IsNumber({}, { message: 'Valor inválido.' })
  valor!: number;

  @IsOptional()
  @IsEnum(FinanceiroTituloStatus)
  status?: FinanceiroTituloStatus;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  formaPagamento?: string;

  @IsOptional()
  @IsEnum(FinanceiroDespesaNatureza, {
    message: 'Natureza inválida. Use fixa ou variavel.',
  })
  natureza?: FinanceiroDespesaNatureza;
}
