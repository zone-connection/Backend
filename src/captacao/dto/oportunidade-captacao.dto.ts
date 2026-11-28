import { CaptacaoImovelTipo } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { CAPTACAO_MOTIVOS_PERDA } from '../captacao.constants';

export class CreateOportunidadeCaptacaoDto {
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  localizacao!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  proprietarioNome!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  telefone?: string;

  @IsOptional()
  @IsEnum(CaptacaoImovelTipo)
  tipo?: CaptacaoImovelTipo;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  valorPretendido?: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  origem?: string;

  @IsUUID()
  responsavelId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  proximaAcao?: string;

  @IsOptional()
  @IsDateString()
  proximaAcaoEm?: string;
}

export class UpdateOportunidadeCaptacaoDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  localizacao?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  proprietarioNome?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  telefone?: string;

  @IsOptional()
  @IsEnum(CaptacaoImovelTipo)
  tipo?: CaptacaoImovelTipo;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  valorPretendido?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  origem?: string;

  @IsOptional()
  @IsUUID()
  responsavelId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  proximaAcao?: string;

  @IsOptional()
  @IsDateString()
  proximaAcaoEm?: string | null;
}

export class PerderOportunidadeDto {
  @IsIn([...CAPTACAO_MOTIVOS_PERDA])
  motivoPerda!: string;

  @IsOptional()
  @IsDateString()
  retornoEm?: string;
}
