import { FinanceiroComissaoStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { PremiacaoComissaoDto } from './premiacao-comissao.dto';

function toOptionalInt({ value }: { value: unknown }) {
  if (value === undefined || value === null || value === '') return undefined;
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  return Math.round(n);
}

export class UpdateComissaoDto extends PremiacaoComissaoDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'O nome do cliente deve ter ao menos 2 caracteres.' })
  @MaxLength(120)
  clienteNome?: string;

  @IsOptional()
  @Transform(toOptionalInt)
  @IsInt({ message: 'Valor da venda inválido.' })
  @Min(0, { message: 'Informe o valor da venda.' })
  vgv?: number;

  @IsOptional()
  @IsDateString({}, { message: 'Data da venda inválida.' })
  dataVenda?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsUUID('4', { message: 'Corretor inválido.' })
  corretorId?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsUUID('4', { message: 'Construtora inválida.' })
  construtoraId?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsUUID('4', { message: 'Empreendimento inválido.' })
  empreendimentoId?: string | null;

  @IsOptional()
  @IsDateString({}, { message: 'Data prevista de recebimento inválida.' })
  dataPrevistaRecebimento?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  percentualImobiliaria?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  percentualTributos?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  percentualCorretor?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  percentualGerente?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  percentualCaixa?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  percentualSocios?: number;

  @IsOptional()
  @IsEnum(FinanceiroComissaoStatus)
  status?: FinanceiroComissaoStatus;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observacao?: string;
}
