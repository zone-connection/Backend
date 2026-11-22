import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Dados cadastrais da imobiliária (admin do tenant).
 * Usados em contratos (ex.: intermediação) e identificação.
 */
export class UpdateTenantCompanyDto {
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
  @IsString()
  @MaxLength(40)
  creci?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  telefone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  endereco?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  cidade?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  banco?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  agencia?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  contaBancaria?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  pix?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  representanteLegal?: string;

  @IsOptional()
  @IsBoolean()
  emailOperacional?: boolean;

  /** 0 desliga o aviso de leads atrasados. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(5000)
  leadsAtrasadosLimite?: number;
}
