import {
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
import { Transform } from 'class-transformer';

function toInt({ value }: { value: unknown }) {
  if (value === undefined || value === null || value === '') return value;
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  return Math.round(n);
}

export class CreateCadastroVendaDto {
  @IsString()
  @MinLength(2, { message: 'Informe o nome do cliente.' })
  @MaxLength(120)
  clienteNome!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  telefone?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsUUID('4', { message: 'Construtora inválida.' })
  construtoraId?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsUUID('4', { message: 'Empreendimento inválido.' })
  empreendimentoId?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsUUID('4', { message: 'Corretor inválido.' })
  corretorId?: string | null;

  @IsDateString({}, { message: 'Data da venda inválida.' })
  dataVenda!: string;

  @Transform(toInt)
  @IsInt({ message: 'VGV inválido.' })
  @Min(0, { message: 'VGV não pode ser negativo.' })
  vgv!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  obs?: string | null;
}

export class UpdateCadastroVendaDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Informe o nome do cliente.' })
  @MaxLength(120)
  clienteNome?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  telefone?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsUUID('4', { message: 'Construtora inválida.' })
  construtoraId?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsUUID('4', { message: 'Empreendimento inválido.' })
  empreendimentoId?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsUUID('4', { message: 'Corretor inválido.' })
  corretorId?: string | null;

  @IsOptional()
  @IsDateString({}, { message: 'Data da venda inválida.' })
  dataVenda?: string;

  @IsOptional()
  @Transform(toInt)
  @IsInt({ message: 'VGV inválido.' })
  @Min(0, { message: 'VGV não pode ser negativo.' })
  vgv?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  obs?: string | null;
}
