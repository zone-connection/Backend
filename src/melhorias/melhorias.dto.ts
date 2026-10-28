import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

const CATEGORIAS = ['funcionalidade_nova', 'melhoria_existente', 'usabilidade', 'integracao'] as const;
const PRIORIDADES = ['baixa', 'normal', 'alta', 'urgente'] as const;
const STATUS = [
  'recebida',
  'em_avaliacao',
  'aprovada',
  'planejada',
  'em_desenvolvimento',
  'entregue',
  'recusada',
  'arquivada',
] as const;

export class CreateMelhoriaDto {
  @IsUUID('4')
  tenantId!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(160)
  titulo!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(8000)
  descricao!: string;

  @IsIn(CATEGORIAS)
  categoria!: (typeof CATEGORIAS)[number];

  @IsOptional()
  @IsIn(PRIORIDADES)
  prioridade?: (typeof PRIORIDADES)[number];

  @IsOptional()
  @IsUUID('4')
  responsavelId?: string;
}

export class UpdateMelhoriaDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  titulo?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(8000)
  descricao?: string;

  @IsOptional()
  @IsIn(CATEGORIAS)
  categoria?: (typeof CATEGORIAS)[number];

  @IsOptional()
  @IsIn(PRIORIDADES)
  prioridade?: (typeof PRIORIDADES)[number];

  @IsOptional()
  @IsIn(STATUS)
  status?: (typeof STATUS)[number];

  @IsOptional()
  @IsUUID('4')
  responsavelId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  justificativaDecisao?: string;
}

export class CreateMelhoriaComentarioDto {
  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  texto!: string;

  @IsOptional()
  @IsBoolean()
  interna?: boolean;
}
