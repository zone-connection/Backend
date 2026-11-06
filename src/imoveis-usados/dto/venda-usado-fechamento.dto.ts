import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import {
  VendaUsadoContratoStatus,
  VendaUsadoDocumentoCategoria,
  VendaUsadoDocumentoFornecedor,
  VendaUsadoDocumentoStatus,
  VendaUsadoDocumentoTipo,
  VendaUsadoFechamentoStatus,
} from '@prisma/client';

export class CreateFechamentoUsadoDto {
  @IsUUID()
  propostaId!: string;

  @IsOptional()
  @IsUUID()
  responsavelId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observacoes?: string;
}

export class UpdateFechamentoUsadoDto {
  @IsOptional()
  @IsEnum(VendaUsadoFechamentoStatus)
  status?: VendaUsadoFechamentoStatus;

  @IsOptional()
  @IsUUID()
  responsavelId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observacoes?: string;
}

export class CreateDocumentoUsadoDto {
  @IsEnum(VendaUsadoDocumentoCategoria)
  categoria!: VendaUsadoDocumentoCategoria;

  @IsEnum(VendaUsadoDocumentoTipo)
  tipo!: VendaUsadoDocumentoTipo;

  @IsString()
  @MaxLength(160)
  nome!: string;

  @IsOptional()
  @IsBoolean()
  obrigatorio?: boolean;

  @IsEnum(VendaUsadoDocumentoFornecedor)
  fornecedor!: VendaUsadoDocumentoFornecedor;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observacao?: string;
}

export class UpdateDocumentoUsadoDto {
  @IsOptional()
  @IsEnum(VendaUsadoDocumentoStatus)
  status?: VendaUsadoDocumentoStatus;

  @IsOptional()
  @IsUUID()
  analistaId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observacao?: string;
}

export class CreateContratoUsadoDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  numero?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observacoes?: string;
}

export class UpdateContratoUsadoDto {
  @IsOptional()
  @IsEnum(VendaUsadoContratoStatus)
  status?: VendaUsadoContratoStatus;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observacoes?: string;
}
