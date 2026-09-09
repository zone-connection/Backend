import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { HEX_COR_REGEX } from '../../common/utils/cor';
import { toDateOnly } from './create-empreendimento.dto';

function emptyToNull({ value }: { value: unknown }) {
  if (value === '') return null;
  return value;
}

export class UpdateEmpreendimentoDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  nome?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsString()
  @Matches(HEX_COR_REGEX, { message: 'Informe a cor no formato #RRGGBB.' })
  cor?: string | null;

  @IsOptional()
  @IsUUID('4')
  construtoraId?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsUUID('4')
  localidadeId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  cidade?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  endereco?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(80)
  tipo?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(80)
  status?: string | null;

  @IsOptional()
  @Transform(toDateOnly)
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsDateString({}, { message: 'Previsão de entrega inválida.' })
  previsaoEntrega?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observacao?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  quartos?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  banheiros?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  vagas?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  valorReferencia?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  rendaAPartirDe?: number | null;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : value;
  })
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsNumber()
  @Min(0)
  areaM2?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  externalUrl?: string | null;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
