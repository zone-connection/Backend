import {
  Allow,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { TenantPlano } from '@prisma/client';

function emptyToNull({ value }: { value: unknown }) {
  if (value === '' || value === undefined) return null;
  return value;
}

/**
 * Update de tenant: dados, plano, cota, logo e módulos.
 */
export class UpdateTenantDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'O nome deve ter ao menos 2 caracteres.' })
  @MaxLength(120)
  name?: string;

  /** CPF (11) ou CNPJ (14), somente dígitos ou formatado. */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  documento?: string;

  @IsOptional()
  @IsIn(['ativo', 'inativo'], { message: 'Status inválido.' })
  status?: 'ativo' | 'inativo';

  @IsOptional()
  @IsEnum(TenantPlano, {
    message: 'Plano inválido. Use solo, bronze, prata ou ouro.',
  })
  plano?: TenantPlano;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  maxUsuarios?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000)
  usuariosExtras?: number;

  @IsOptional()
  @IsBoolean()
  iaBotEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  isTest?: boolean;

  @IsOptional()
  @Transform(emptyToNull)
  @Allow()
  logoUrl?: string | null;

  @IsOptional()
  @Allow()
  modules?: Record<string, boolean> | null;
}
