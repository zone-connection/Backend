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
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  VendaUsadoNegociacaoOrigem,
  VendaUsadoPropostaStatus,
  VendaUsadoVisitaInteresse,
  VendaUsadoVisitaStatus,
} from '@prisma/client';

export class CreateVisitaUsadoDto {
  @IsUUID()
  interessadoId!: string;

  @IsUUID()
  responsavelId!: string;

  @IsDateString()
  dataHora!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observacoes?: string;
}

export class UpdateVisitaUsadoDto {
  @IsOptional()
  @IsUUID()
  responsavelId?: string;

  @IsOptional()
  @IsDateString()
  dataHora?: string;

  @IsOptional()
  @IsEnum(VendaUsadoVisitaStatus)
  status?: VendaUsadoVisitaStatus;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observacoes?: string;
}

export class FeedbackVisitaUsadoDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  avaliacao!: number;

  @IsEnum(VendaUsadoVisitaInteresse)
  interesse!: VendaUsadoVisitaInteresse;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comentarios?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observacoes?: string;
}

export class CreatePropostaUsadoDto {
  @IsUUID()
  interessadoId!: string;

  @IsUUID()
  responsavelId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  valor!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  entrada?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  valorFinanciamento?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observacoes?: string;
}

export class UpdatePropostaUsadoDto {
  @IsOptional()
  @IsEnum(VendaUsadoPropostaStatus)
  status?: VendaUsadoPropostaStatus;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observacoes?: string;
}

export class CreateNegociacaoMovimentoDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  valor!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  entrada?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  valorFinanciamento?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observacoes?: string;

  @IsOptional()
  @IsEnum(VendaUsadoNegociacaoOrigem)
  origem?: VendaUsadoNegociacaoOrigem;

  @IsOptional()
  @IsUUID()
  responsavelId?: string;
}
