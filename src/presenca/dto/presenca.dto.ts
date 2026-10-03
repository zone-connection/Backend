import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { PresencaNatureza } from '@prisma/client';

export class CreatePresencaTipoDto {
  @IsString()
  @MaxLength(80)
  nome!: string;

  @IsString()
  @MaxLength(8)
  sigla!: string;

  @IsEnum(PresencaNatureza)
  natureza!: PresencaNatureza;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  cor?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roles?: string[];
}

export class UpdatePresencaTipoDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  nome?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  sigla?: string;

  @IsOptional()
  @IsEnum(PresencaNatureza)
  natureza?: PresencaNatureza;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  cor?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roles?: string[];
}

export class UpsertPresencaLancamentoDto {
  @IsString()
  userId!: string;

  @IsString()
  data!: string;

  @IsOptional()
  @IsString()
  tipoId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  observacao?: string;
}
