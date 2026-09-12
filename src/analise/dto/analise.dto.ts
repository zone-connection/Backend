import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';

/** Campos Int em reais: aceita decimal (centavos) e arredonda. */
function toOptionalInt({ value }: { value: unknown }) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  return Math.round(n);
}

export class QueryAnaliseDto {
  /** Admin/gerente/analista: filtra análises cujo lead pertence a este corretor. */
  @IsOptional()
  @IsUUID('4', { message: 'Corretor inválido.' })
  corretorId?: string;

  @IsOptional()
  @IsIn(['pendente', 'em_analise', 'aprovado', 'reprovado'], {
    message: 'Status inválido.',
  })
  status?: 'pendente' | 'em_analise' | 'aprovado' | 'reprovado';
}

const ANALISE_STATUSES = [
  'pendente',
  'em_analise',
  'aprovado',
  'reprovado',
] as const;

export class UpdateAnaliseDto {
  @IsOptional()
  @IsIn(ANALISE_STATUSES, { message: 'Status inválido.' })
  status?: (typeof ANALISE_STATUSES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  parecer?: string | null;

  /** VGV em reais (inteiro), gravado na documentação ao aprovar. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @Transform(toOptionalInt)
  @IsInt({ message: 'VGV inválido.' })
  @Min(0, { message: 'VGV não pode ser negativo.' })
  vgv?: number | null;
}
