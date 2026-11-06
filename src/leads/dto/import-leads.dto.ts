import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  CONTATO_TIPOS,
  LEAD_INTERESSES,
  LEAD_PRIORIDADES,
} from '../lead.constants';
import { LeadProspeccaoDto } from './lead-prospeccao.dto';

export class ImportLeadItemDto {
  @IsString()
  @MinLength(2, { message: 'O nome deve ter ao menos 2 caracteres.' })
  @MaxLength(120)
  nome!: string;

  @IsString()
  @Matches(/^\(\d{2}\) \d{4,5}-\d{4}$/, {
    message: 'Telefone inválido. Use o formato (81) 99999-9999.',
  })
  @MaxLength(20)
  telefone!: string;

  @IsOptional()
  @ValidateIf((_, v) => v != null && String(v).trim() !== '')
  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  @MaxLength(255)
  email?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  origem?: string;

  @IsOptional()
  @IsIn(LEAD_INTERESSES, { message: 'Interesse inválido.' })
  interesse?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  cidade?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  bairro?: string;

  @IsOptional()
  @IsIn(LEAD_PRIORIDADES, { message: 'Prioridade inválida.' })
  prioridade?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return value;
    const n = Number(value);
    return Number.isFinite(n) ? Math.round(n) : value;
  })
  @IsInt({ message: 'Renda inválida.' })
  @Min(0)
  renda?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  tipoRenda?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  estadoCivil?: string | null;

  @IsOptional()
  @IsUUID('4', { message: 'Corretor inválido.' })
  corretorId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => LeadProspeccaoDto)
  prospeccao?: LeadProspeccaoDto | null;
}

export class ImportLeadsDto {
  /** lead (padrão) = captação; cliente = carteira. */
  @IsOptional()
  @IsIn(CONTATO_TIPOS, { message: 'Tipo inválido.' })
  tipo?: (typeof CONTATO_TIPOS)[number];

  @IsArray()
  @ArrayMinSize(1, { message: 'Envie ao menos 1 registro.' })
  @ArrayMaxSize(600, { message: 'Máximo de 600 registros por importação.' })
  @ValidateNested({ each: true })
  @Type(() => ImportLeadItemDto)
  leads!: ImportLeadItemDto[];
}

/** Prévia da importação: telefones/e-mails já cadastrados no tenant. */
export class CheckImportLeadsDto {
  @IsOptional()
  @IsIn(CONTATO_TIPOS, { message: 'Tipo inválido.' })
  tipo?: (typeof CONTATO_TIPOS)[number];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(600)
  @IsString({ each: true })
  telefones?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(600)
  @IsString({ each: true })
  emails?: string[];
}
