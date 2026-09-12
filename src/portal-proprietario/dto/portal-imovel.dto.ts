import { CaptacaoImovelTipo } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreatePortalImovelDto {
  @IsEnum(CaptacaoImovelTipo)
  tipo!: CaptacaoImovelTipo;

  @IsOptional()
  @IsString()
  @MaxLength(12)
  cep?: string;

  @IsString()
  @MaxLength(160)
  logradouro!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  numero?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  bairro?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  cidade?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  estado?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  valorPretendido?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  descricao?: string;
}

export class UpdatePortalImovelDto {
  @IsOptional()
  @IsEnum(CaptacaoImovelTipo)
  tipo?: CaptacaoImovelTipo;

  @IsOptional()
  @IsString()
  @MaxLength(12)
  cep?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  logradouro?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  numero?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  complemento?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  bairro?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  cidade?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  estado?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  valorPretendido?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  descricao?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  area?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  quartos?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  suites?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  banheiros?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  vagas?: number;
}
