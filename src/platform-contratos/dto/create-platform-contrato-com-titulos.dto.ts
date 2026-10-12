import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  PlatformContratoStatus,
  PlatformContratoTipo,
  TenantPlano,
} from '@prisma/client';

export class CreatePlatformContratoComTitulosDto {
  @IsUUID('4', { message: 'Imobiliária inválida.' })
  tenantId!: string;

  @IsString()
  @MinLength(2, { message: 'Informe um título.' })
  @MaxLength(160)
  titulo!: string;

  @IsEnum(PlatformContratoTipo, { message: 'Tipo inválido.' })
  tipo!: PlatformContratoTipo;

  @IsOptional()
  @IsEnum(TenantPlano, { message: 'Plano inválido.' })
  plano?: TenantPlano | null;

  @Type(() => Number)
  @IsNumber({}, { message: 'Valor de adesão inválido.' })
  @Min(0.01, { message: 'Informe o valor de adesão.' })
  valorAdesao!: number;

  /** Quantidade de parcelas para dividir o valor total da adesão. */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Quantidade de parcelas da adesão inválida.' })
  @Min(1)
  @Max(120)
  qtdParcelasAdesao?: number;

  @Type(() => Number)
  @IsNumber({}, { message: 'Valor de mensalidade inválido.' })
  @Min(0.01, { message: 'Informe o valor da mensalidade.' })
  valorMensalidade!: number;

  /** Quantidade de mensalidades (mín. 1). */
  @Type(() => Number)
  @IsInt({ message: 'Quantidade de mensalidades inválida.' })
  @Min(1)
  @Max(120)
  qtdMensalidades!: number;

  @IsDateString({}, { message: 'Data de início inválida.' })
  dataInicio!: string;

  /** Vencimento da adesão / 1ª mensalidade. */
  @IsDateString({}, { message: 'Vencimento inválido.' })
  vencimento!: string;

  @IsOptional()
  @IsEnum(PlatformContratoStatus, { message: 'Status inválido.' })
  status?: PlatformContratoStatus;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observacao?: string;

  /** Categoria de recebimento (nome) nos títulos gerados. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  categoria?: string;

  @IsOptional()
  @IsUUID()
  parceiroId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  parceiroNome?: string;
}
