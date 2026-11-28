import { RhCompromissoTipo, RhEtapa, RhModeloTipo } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateCandidatoDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  nome!: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  telefone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  creci?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  experiencia?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  observacoes?: string;

  @IsOptional()
  @IsDateString()
  entradaEm?: string;

  @IsOptional()
  @IsUUID()
  responsavelId?: string;
}

export class UpdateCandidatoDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  nome?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  telefone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  creci?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  experiencia?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  observacoes?: string;

  @IsOptional()
  @IsDateString()
  entradaEm?: string;

  @IsOptional()
  @IsUUID()
  responsavelId?: string;
}

export class MoverCandidatoDto {
  @IsEnum(RhEtapa)
  etapa!: RhEtapa;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  motivo?: string;
}

export class ConverterCandidatoDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;
}

export class DesligarDto {
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  motivo!: string;
}

export class CreateTreinamentoDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  titulo!: string;

  @IsDateString()
  data!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  observacoes?: string;

  @IsOptional()
  @IsUUID()
  candidatoId?: string;

  @IsOptional()
  @IsUUID()
  userId?: string;
}

export class CreateCompromissoDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  titulo!: string;

  @IsEnum(RhCompromissoTipo)
  tipo!: RhCompromissoTipo;

  @IsDateString()
  startsAt!: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observacoes?: string;

  @IsOptional()
  @IsUUID()
  candidatoId?: string;

  @IsOptional()
  @IsUUID()
  userId?: string;
}

export class PeriodoQueryDto {
  @IsOptional()
  @IsDateString()
  de?: string;

  @IsOptional()
  @IsDateString()
  ate?: string;
}

export class ModeloMetaDto {
  @IsEnum(RhModeloTipo)
  tipo!: RhModeloTipo;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  nome!: string;
}

export class DocumentoMetaDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  nome!: string;

  @IsOptional()
  @IsUUID()
  candidatoId?: string;

  @IsOptional()
  @IsUUID()
  userId?: string;
}

export class EquipeQueryDto {
  @IsOptional()
  @IsString()
  situacao?: 'ativos' | 'desligados';

  @Type(() => String)
  @IsOptional()
  situacaoRaw?: string;
}
