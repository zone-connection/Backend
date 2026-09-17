import { CaptacaoImovelTipo, InteresseUsadoStatus, VendaUsadoStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateVendaUsadoDto {
  @IsUUID()
  imovelId!: string;

  @IsUUID()
  responsavelId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  precoVenda?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observacoes?: string;

  @IsOptional()
  @IsUUID()
  funilId?: string;
}

export class UpdateVendaUsadoDto {
  @IsOptional()
  @IsUUID()
  responsavelId?: string;

  @IsOptional()
  @IsEnum(VendaUsadoStatus)
  status?: VendaUsadoStatus;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  precoVenda?: number | null;

  @IsOptional()
  @IsUUID()
  funilEtapaId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observacoes?: string;
}

export class QueryVendasUsadoDto {
  @IsOptional()
  @IsEnum(VendaUsadoStatus)
  status?: VendaUsadoStatus;

  @IsOptional()
  @IsUUID()
  responsavelId?: string;

  @IsOptional()
  @IsEnum(CaptacaoImovelTipo)
  tipo?: CaptacaoImovelTipo;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  cidade?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  bairro?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  precoMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  precoMax?: number;
}

export class CreateInteressadoUsadoDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  nome!: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  telefone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observacoes?: string;

  @IsOptional()
  @IsEnum(CaptacaoImovelTipo)
  tipoDesejado?: CaptacaoImovelTipo;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  cidade?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  bairros?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  precoMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  precoMax?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  quartosMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  banheirosMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  vagasMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  areaMin?: number;
}

export class UpdateInteressadoUsadoDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  nome?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  telefone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observacoes?: string;

  @IsOptional()
  @IsEnum(CaptacaoImovelTipo)
  tipoDesejado?: CaptacaoImovelTipo | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  cidade?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  bairros?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  precoMin?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  precoMax?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  quartosMin?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  banheirosMin?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  vagasMin?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  areaMin?: number | null;
}

export class VincularInteressadoDto {
  @IsUUID()
  interessadoId!: string;

  @IsOptional()
  @IsEnum(InteresseUsadoStatus)
  interesse?: InteresseUsadoStatus;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observacoes?: string;
}

export class UpdateVinculoDto {
  @IsOptional()
  @IsEnum(InteresseUsadoStatus)
  interesse?: InteresseUsadoStatus;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observacoes?: string;
}
