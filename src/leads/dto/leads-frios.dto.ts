import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class QueryLeadsFriosDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([20, 50])
  pageSize?: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;
}

export class LeadFrioRowDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  nome!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(30)
  telefone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  cidade?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  bairro?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  origem?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  tipoRenda?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  estadoCivil?: string;

  @IsOptional()
  @IsNumber()
  renda?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  empreendimento?: string;
}

export class ImportLeadsFriosDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => LeadFrioRowDto)
  rows!: LeadFrioRowDto[];
}

export class LeadFrioIdsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true })
  ids!: string[];
}

export class DistribuirFrioAlocacaoDto {
  @IsUUID()
  corretorId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  quantidade!: number;
}

export class DistribuirLeadsFriosDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsUUID('4', { each: true })
  ids!: string[];

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => DistribuirFrioAlocacaoDto)
  alocacoes!: DistribuirFrioAlocacaoDto[];
}

export class EnviarLeadsFriosDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5000)
  @IsUUID('4', { each: true })
  ids!: string[];
}
