import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  FinanceiroDespesaNatureza,
  FinanceiroTituloStatus,
} from '@prisma/client';

export class UpdateParcelaGrupoItemDto {
  @IsUUID()
  id!: string;

  @IsOptional()
  @IsDateString({}, { message: 'Vencimento da parcela inválido.' })
  vencimento?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Valor da parcela inválido.' })
  @Min(0.01, { message: 'Valor da parcela deve ser maior que zero.' })
  valor?: number;

  @IsOptional()
  @IsEnum(FinanceiroTituloStatus)
  status?: FinanceiroTituloStatus;
}

export class UpdateTitulosGrupoDto {
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
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateParcelaGrupoItemDto)
  parcelas?: UpdateParcelaGrupoItemDto[];

  @IsOptional()
  @IsEnum(FinanceiroDespesaNatureza, {
    message: 'Natureza inválida. Use fixa ou variavel.',
  })
  natureza?: FinanceiroDespesaNatureza | null;
}
