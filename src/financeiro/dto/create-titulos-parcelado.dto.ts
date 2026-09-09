import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  FinanceiroDespesaNatureza,
  FinanceiroTituloTipo,
} from '@prisma/client';

export class ParcelaItemDto {
  @IsDateString({}, { message: 'Vencimento da parcela inválido.' })
  vencimento!: string;

  @Type(() => Number)
  @IsNumber({}, { message: 'Valor da parcela inválido.' })
  @Min(0.01, { message: 'Valor da parcela deve ser maior que zero.' })
  valor!: number;
}

export class CreateTitulosParceladoDto {
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

  @IsArray()
  @ArrayMinSize(2, { message: 'Informe ao menos 2 parcelas.' })
  @ValidateNested({ each: true })
  @Type(() => ParcelaItemDto)
  parcelas!: ParcelaItemDto[];

  @IsOptional()
  @IsUUID('4')
  platformContratoId?: string;

  @IsOptional()
  @IsBoolean()
  indeterminado?: boolean;

  @IsOptional()
  @IsEnum(FinanceiroDespesaNatureza, {
    message: 'Natureza inválida. Use fixa ou variavel.',
  })
  natureza?: FinanceiroDespesaNatureza;
}
