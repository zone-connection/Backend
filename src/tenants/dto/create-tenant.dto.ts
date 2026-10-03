import {
  Allow,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { TenantPlano, UserStatus } from '@prisma/client';

function emptyToNull({ value }: { value: unknown }) {
  if (value === '' || value === undefined) return null;
  return value;
}

/**
 * Criação de tenant.
 * Admin gerado automaticamente. Plano define módulos e cota base.
 */
export class CreateTenantDto {
  @IsString()
  @MinLength(2, { message: 'O nome deve ter ao menos 2 caracteres.' })
  @MaxLength(120)
  name!: string;

  @IsString()
  @MinLength(2, { message: 'O slug deve ter ao menos 2 caracteres.' })
  @MaxLength(80)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message:
      'O slug deve conter apenas letras minúsculas, números e hífens (ex.: minha-imobiliaria).',
  })
  slug!: string;

  /** CPF (11) ou CNPJ (14), somente dígitos ou formatado. */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  documento?: string;

  @IsOptional()
  @IsIn([UserStatus.ativo, UserStatus.inativo], {
    message: 'Status inválido.',
  })
  status?: UserStatus;

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
