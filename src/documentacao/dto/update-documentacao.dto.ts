import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

/** Campos Int em reais: aceita decimal (centavos) e arredonda. */
function toOptionalInt({ value }: { value: unknown }) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  return Math.round(n);
}

export class UpdateDocumentacaoDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'O nome deve ter ao menos 2 caracteres.' })
  @MaxLength(120)
  nome?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsUUID('4', { message: 'Construtora inválida.' })
  construtoraId?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsUUID('4', { message: 'Empreendimento inválido.' })
  empreendimentoId?: string | null;

  @IsOptional()
  @IsString({ message: 'Fonte inválida.' })
  @MinLength(1, { message: 'Informe a fonte.' })
  @MaxLength(80)
  fonte?: string;

  @IsOptional()
  @IsString({ message: 'Status 1 inválido.' })
  @MinLength(1, { message: 'Informe o status 1.' })
  @MaxLength(80)
  status1?: string;

  @IsOptional()
  @IsString({ message: 'Status 2 inválido.' })
  @MinLength(1, { message: 'Informe o status 2.' })
  @MaxLength(80)
  status2?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsUUID('4', { message: 'Corretor inválido.' })
  corretorId?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsUUID('4', { message: 'Gerente inválido.' })
  gerenteId?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsDateString({}, { message: 'Data de análise inválida.' })
  dataAnalise?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsDateString({}, { message: 'Data de venda inválida.' })
  dataVenda?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @Transform(toOptionalInt)
  @IsInt({ message: 'VGV inválido.' })
  @Min(0, { message: 'VGV não pode ser negativo.' })
  vgv?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  obs?: string | null;

  @IsOptional()
  @IsBoolean()
  temEntrada?: boolean;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @Transform(toOptionalInt)
  @IsInt({ message: 'Valor de entrada inválido.' })
  @Min(0, { message: 'Valor de entrada não pode ser negativo.' })
  valorEntrada?: number | null;

  @IsOptional()
  @IsBoolean()
  temFgts?: boolean;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @Transform(toOptionalInt)
  @IsInt({ message: 'Valor de FGTS inválido.' })
  @Min(0, { message: 'Valor de FGTS não pode ser negativo.' })
  valorFgts?: number | null;

  @IsOptional()
  @IsBoolean()
  temDependente?: boolean;

  /** Data de cadastro retroativa (ISO). */
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsDateString({}, { message: 'Data de cadastro inválida.' })
  createdAt?: string | null;
}
