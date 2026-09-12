import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PrazoUnidade } from '@prisma/client';

export class AdiarPrazoDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  valor!: number;

  @IsEnum(PrazoUnidade, {
    message: 'Unidade inválida. Use minutos, horas ou dias.',
  })
  unidade!: PrazoUnidade;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  motivo?: string;
}
