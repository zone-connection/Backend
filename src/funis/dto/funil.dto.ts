import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { FunilEtapaPapel, FunilTipo, PrazoUnidade } from '@prisma/client';

export class CreateFunilEtapaDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  label!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  color?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsEnum(FunilEtapaPapel, { message: 'Papel de etapa inválido.' })
  papel?: FunilEtapaPapel | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  prazoValor?: number | null;

  @IsOptional()
  @IsEnum(PrazoUnidade, {
    message: 'Unidade inválida. Use minutos, horas ou dias.',
  })
  prazoUnidade?: PrazoUnidade;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  alertaAntecedenciaPercent?: number;
}

export class QueryFunisDto {
  @IsOptional()
  @IsEnum(FunilTipo, { message: 'Tipo de funil inválido.' })
  tipo?: FunilTipo;
}

export class CreateFunilDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsEnum(FunilTipo, { message: 'Tipo de funil inválido.' })
  tipo?: FunilTipo;

  /** Se true, copia as etapas padrão. Ignorado se `etapas` for enviado. */
  @IsOptional()
  @IsBoolean()
  usarPadrao?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateFunilEtapaDto)
  etapas?: CreateFunilEtapaDto[];

  @IsOptional()
  @IsBoolean()
  ativar?: boolean;
}

export class UpdateFunilDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsEnum(FunilTipo, { message: 'Tipo de funil inválido.' })
  tipo?: FunilTipo;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  inatividadeValor?: number;

  @IsOptional()
  @IsEnum(PrazoUnidade, {
    message: 'Unidade inválida. Use minutos, horas ou dias.',
  })
  inatividadeUnidade?: PrazoUnidade;
}

export class UpdateFunilEtapaDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  label?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  color?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  /** null limpa o papel (etapa intermediária). */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsEnum(FunilEtapaPapel, { message: 'Papel de etapa inválido.' })
  papel?: FunilEtapaPapel | null;

  /** null remove o prazo da etapa. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  prazoValor?: number | null;

  @IsOptional()
  @IsEnum(PrazoUnidade, {
    message: 'Unidade inválida. Use minutos, horas ou dias.',
  })
  prazoUnidade?: PrazoUnidade;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  alertaAntecedenciaPercent?: number;
}

export class ReorderFunilEtapasDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  orderedIds!: string[];
}
