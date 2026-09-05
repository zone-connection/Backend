import { CaptacaoImovelTipo } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateCaptacaoDto {
  @IsUUID()
  proprietarioId!: string;

  @IsUUID()
  imovelId!: string;

  @IsUUID()
  responsavelId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  origem?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  exclusividade?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  valorPretendido?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  valorAvaliacao?: number;

  @IsOptional()
  @IsUUID()
  funilId?: string;

  @IsOptional()
  @IsUUID()
  funilEtapaId?: string;
}

export class UpdateCaptacaoDto {
  @IsOptional()
  @IsUUID()
  responsavelId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  origem?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  exclusividade?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  valorPretendido?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  valorAvaliacao?: number | null;

  @IsOptional()
  @IsUUID()
  funilEtapaId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  motivoPerda?: string;
}

export class QueryCaptacoesDto {
  @IsOptional()
  @IsUUID()
  proprietarioId?: string;

  @IsOptional()
  @IsUUID()
  responsavelId?: string;

  @IsOptional()
  @IsUUID()
  funilEtapaId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  origem?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    return undefined;
  })
  @IsBoolean()
  exclusividade?: boolean;

  @IsOptional()
  @IsEnum(CaptacaoImovelTipo)
  tipo?: CaptacaoImovelTipo;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  cidade?: string;

  @IsOptional()
  @IsDateString()
  createdFrom?: string;

  @IsOptional()
  @IsDateString()
  createdTo?: string;
}
