import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
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
import { LEAD_INTERESSES, LEAD_PRIORIDADES, CONTATO_TIPOS } from '../lead.constants';
import { LeadProspeccaoDto } from './lead-prospeccao.dto';

export class CreateLeadDto {
  /** lead (padrão) ou cliente da carteira pessoal. */
  @IsOptional()
  @IsIn(CONTATO_TIPOS, { message: 'Tipo inválido. Use lead ou cliente.' })
  tipo?: string;

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
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  @MaxLength(255)
  email?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsString()
  @MaxLength(60)
  origem?: string | null;

  @IsIn(LEAD_INTERESSES, { message: 'Interesse inválido.' })
  interesse!: string;

  @IsString()
  @MaxLength(80)
  cidade!: string;

  @IsString()
  @MaxLength(80)
  bairro!: string;

  // A etapa é validada dinamicamente contra o catálogo ativo no LeadsService.
  @IsOptional()
  @IsString()
  @MaxLength(60)
  stage?: string;

  @IsOptional()
  @IsIn(LEAD_PRIORIDADES, { message: 'Prioridade inválida.' })
  prioridade?: string;

  /** Renda mensal do cliente (opcional). Aceita centavos e arredonda para inteiro. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @Transform(({ value }) => {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? Math.round(n) : value;
  })
  @IsInt({ message: 'Renda inválida.' })
  @Min(0, { message: 'Renda não pode ser negativa.' })
  renda?: number | null;

  /** Tipo de renda do cliente (opcional). */
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsString()
  @MaxLength(60)
  tipoRenda?: string | null;

  /** Estado civil do cliente (opcional). */
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsString()
  @MaxLength(40)
  estadoCivil?: string | null;

  /** Orçamento máximo para imóvel (opcional). */
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @Transform(({ value }) => {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? Math.round(n) : value;
  })
  @IsInt({ message: 'Orçamento inválido.' })
  @Min(0, { message: 'Orçamento não pode ser negativo.' })
  orcamentoMax?: number | null;

  /** Mínimo de quartos desejado (opcional). */
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @Type(() => Number)
  @IsInt({ message: 'Quartos mínimos inválidos.' })
  @Min(0)
  quartosMin?: number | null;

  /** Mínimo de vagas desejado (opcional). */
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @Type(() => Number)
  @IsInt({ message: 'Vagas mínimas inválidas.' })
  @Min(0)
  vagasMin?: number | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];

  /**
   * Corretor dono do lead. Ignorado para o perfil corretor (força o próprio id).
   * Admin/gerente: opcional — pode ficar sem corretor.
   * Sem corretor + com equipeId = pool da equipe; ambos nulos = sem vínculo.
   */
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsUUID('4', { message: 'Corretor inválido.' })
  corretorId?: string | null;

  /**
   * Equipe/gerente que recebe o lead (pool). Opcional.
   * Admin escolhe a equipe do gerente; gerente pode omitir para deixar sem vínculo.
   */
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsUUID('4', { message: 'Equipe inválida.' })
  equipeId?: string | null;

  /** Data de cadastro retroativa (ISO). Se omitida, usa agora. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsDateString({}, { message: 'Data de cadastro inválida.' })
  createdAt?: string | null;

  /** Prospecção B2B (tenant da plataforma). */
  @IsOptional()
  @ValidateNested()
  @Type(() => LeadProspeccaoDto)
  prospeccao?: LeadProspeccaoDto | null;
}
