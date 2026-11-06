import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class LeadProspeccaoDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  endereco?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  instagram?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  site?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  linkedin?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  atuacao?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  lancamentos?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  usados?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  locacao?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  administracao?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  crmIdentificado?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  tecnologia?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  sinais?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  quemAbordar?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  produtoIndicado?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(10)
  fit?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  motivoFit?: string | null;
}
