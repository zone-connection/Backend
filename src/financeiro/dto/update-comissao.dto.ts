import { FinanceiroComissaoStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsNumber, IsOptional, Max, Min } from 'class-validator';
import { PremiacaoComissaoDto } from './premiacao-comissao.dto';

export class UpdateComissaoDto extends PremiacaoComissaoDto {
  @IsOptional()
  @IsDateString({}, { message: 'Data prevista de recebimento inválida.' })
  dataPrevistaRecebimento?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  percentualImobiliaria?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  percentualTributos?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  percentualCorretor?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  percentualGerente?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  percentualCaixa?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  percentualSocios?: number;

  @IsOptional()
  @IsEnum(FinanceiroComissaoStatus)
  status?: FinanceiroComissaoStatus;
}
