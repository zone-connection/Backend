import { FinanceiroComissaoStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { PremiacaoComissaoDto } from './premiacao-comissao.dto';

export class CreateComissaoDto extends PremiacaoComissaoDto {
  @IsUUID()
  documentacaoId!: string;

  @IsDateString({}, { message: 'Data prevista de recebimento inválida.' })
  dataPrevistaRecebimento!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  percentualImobiliaria!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  percentualTributos!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  percentualCorretor!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  percentualGerente!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  percentualCaixa!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  percentualSocios!: number;

  @IsOptional()
  @IsEnum(FinanceiroComissaoStatus)
  status?: FinanceiroComissaoStatus;
}
