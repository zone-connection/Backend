import {
  IsBoolean,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateRecebimentoDto {
  @IsOptional()
  @IsUUID('4', { message: 'Tipo de recebimento inválido.' })
  tipoId?: string;

  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'A descrição deve ter ao menos 2 caracteres.' })
  @MaxLength(200)
  descricao?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Valor inválido.' })
  @Min(0.01, { message: 'Informe um valor maior que zero.' })
  valor?: number;

  @IsOptional()
  @IsDateString({}, { message: 'Data inválida.' })
  data?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: 'Competência inválida. Use YYYY-MM.',
  })
  competencia?: string;

  @IsOptional()
  @IsBoolean()
  recorrente?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observacao?: string;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
