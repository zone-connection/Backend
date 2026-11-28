import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  Max,
  MaxLength,
  Min,
  IsString,
} from 'class-validator';
import { TenantPlano } from '@prisma/client';

/** Condições confirmadas na hora da conversão. Nada aqui é assumido pelo plano. */
export class ConverterLeadClienteDto {
  @IsEnum(TenantPlano, { message: 'Informe o plano acordado (solo, bronze, prata ou ouro).' })
  plano!: TenantPlano;

  @Type(() => Number)
  @IsNumber({}, { message: 'Informe o valor de adesão acordado.' })
  @Min(0.01, { message: 'Informe o valor de adesão acordado.' })
  valorAdesao!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(120)
  qtdParcelasAdesao?: number;

  @Type(() => Number)
  @IsNumber({}, { message: 'Informe o valor da mensalidade acordada.' })
  @Min(0.01, { message: 'Informe o valor da mensalidade acordada.' })
  valorMensalidade!: number;

  @Type(() => Number)
  @IsInt({ message: 'Informe a quantidade de mensalidades.' })
  @Min(1)
  @Max(120)
  qtdMensalidades!: number;

  @IsDateString({}, { message: 'Informe a data de início acordada.' })
  dataInicio!: string;

  @IsDateString({}, { message: 'Informe o vencimento acordado.' })
  vencimento!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observacao?: string;
}
