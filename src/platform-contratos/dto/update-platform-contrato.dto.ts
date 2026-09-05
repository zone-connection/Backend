import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  PlatformContratoStatus,
  PlatformContratoTipo,
  TenantPlano,
} from '@prisma/client';
import { CreatePlatformContratoParcelaDto } from './create-platform-contrato.dto';

export class UpdatePlatformContratoDto {
  @IsOptional()
  @IsUUID('4', { message: 'Imobiliária inválida.' })
  tenantId?: string;

  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Informe um título.' })
  @MaxLength(160)
  titulo?: string;

  @IsOptional()
  @IsEnum(PlatformContratoTipo, { message: 'Tipo inválido.' })
  tipo?: PlatformContratoTipo;

  @IsOptional()
  @IsEnum(TenantPlano, { message: 'Plano inválido.' })
  plano?: TenantPlano | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Valor inválido.' })
  @Min(0)
  valor?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Valor de adesão inválido.' })
  @Min(0)
  valorAdesao?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Valor de mensalidade inválido.' })
  @Min(0)
  valorMensalidade?: number;

  @IsOptional()
  @IsDateString({}, { message: 'Data de início inválida.' })
  dataInicio?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Vencimento inválido.' })
  vencimento?: string | null;

  @IsOptional()
  @IsEnum(PlatformContratoStatus, { message: 'Status inválido.' })
  status?: PlatformContratoStatus;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observacao?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePlatformContratoParcelaDto)
  parcelas?: CreatePlatformContratoParcelaDto[];
}
