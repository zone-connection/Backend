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

function emptyToNull({ value }: { value: unknown }) {
  if (value === '' || value === undefined) return undefined;
  return value;
}

export function toDateOnly({ value }: { value: unknown }) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value !== 'string') return value;
  const match = value.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/);
  if (!match) return value;
  return `${match[1]}-${match[2]}-${match[3] ?? '01'}`;
}

export class CreateEmpreendimentoDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  nome!: string;

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
  cidade?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  endereco?: string;

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
  observacao?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  quartos?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  banheiros?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  vagas?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  valorReferencia?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  rendaAPartirDe?: number;

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
  areaM2?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  externalUrl?: string;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
