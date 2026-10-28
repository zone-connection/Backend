import { IsBoolean, IsDateString, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

const PRIORIDADES = ['baixa', 'normal', 'alta', 'urgente'] as const;
const STATUS = ['aberto', 'em_atendimento', 'aguardando_cliente', 'aguardando_equipe', 'resolvido', 'fechado'] as const;

export class CreateSuporteChamadoDto {
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

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  categoria!: string;

  @IsOptional()
  @IsIn(PRIORIDADES)
  prioridade?: (typeof PRIORIDADES)[number];

  @IsOptional()
  @IsUUID('4')
  responsavelId?: string;

  @IsOptional()
  @IsDateString()
  prazoEm?: string;
}

export class UpdateSuporteChamadoDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  titulo?: string;

  @IsOptional()
  @IsIn(STATUS)
  status?: (typeof STATUS)[number];

  @IsOptional()
  @IsIn(PRIORIDADES)
  prioridade?: (typeof PRIORIDADES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(80)
  categoria?: string;

  @IsOptional()
  @IsUUID('4')
  responsavelId?: string | null;

  @IsOptional()
  @IsDateString()
  prazoEm?: string | null;
}

export class CreateSuporteMensagemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  texto!: string;

  @IsOptional()
  @IsBoolean()
  interna?: boolean;
}
