import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CaptacaoImovelTipo, ImovelFinalidade } from '@prisma/client';

function vazioComoAusente({ value }: { value: unknown }) {
  if (typeof value === 'string' && value.trim() === '') return undefined;
  return value;
}

export class ListarPropertiesApiDto {
  @IsOptional()
  @Transform(vazioComoAusente)
  @IsString()
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @Transform(vazioComoAusente)
  @IsString()
  @MaxLength(120)
  neighborhood?: string;

  @IsOptional()
  @Transform(vazioComoAusente)
  @IsEnum(CaptacaoImovelTipo, {
    message:
      'Tipo inválido. Use apartamento, casa, terreno, sala_comercial, loja, galpao, fazenda, chacara ou outro.',
  })
  type?: CaptacaoImovelTipo;

  @IsOptional()
  @Transform(vazioComoAusente)
  @IsEnum(ImovelFinalidade, {
    message: 'Finalidade inválida. Use venda, aluguel, lancamento ou sala_comercial.',
  })
  purpose?: ImovelFinalidade;

  @IsOptional()
  @Transform(vazioComoAusente)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  bedrooms?: number;

  @IsOptional()
  @Transform(vazioComoAusente)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  bathrooms?: number;

  @IsOptional()
  @Transform(vazioComoAusente)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  minPrice?: number;

  @IsOptional()
  @Transform(vazioComoAusente)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  maxPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
