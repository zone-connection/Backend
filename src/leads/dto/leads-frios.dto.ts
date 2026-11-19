import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

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
}

export class ImportLeadsFriosDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(600)
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
