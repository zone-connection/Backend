import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateProcessoDto {
  @IsUUID()
  leadId: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  nome?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  fonte?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  telefone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  estadoCivil?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  tipoRenda?: string;

  @IsOptional()
  @IsBoolean()
  cotista?: boolean;

  @IsOptional()
  @IsBoolean()
  dependente?: boolean;

  @IsOptional()
  @IsUUID()
  empreendimentoId?: string | null;

  @IsOptional()
  @IsUUID()
  corretorId?: string | null;

  @IsOptional()
  @IsUUID()
  gerenteId?: string | null;
}

export class UpdateProcessoDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  nome?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  fonte?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  telefone?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  estadoCivil?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  tipoRenda?: string;

  @IsOptional()
  @IsBoolean()
  cotista?: boolean;

  @IsOptional()
  @IsBoolean()
  dependente?: boolean;

  @IsOptional()
  @IsUUID()
  empreendimentoId?: string | null;

  @IsOptional()
  @IsUUID()
  corretorId?: string | null;

  @IsOptional()
  @IsUUID()
  gerenteId?: string | null;
}

export class RetornoProcessoDto {
  @IsString()
  resultado: 'aprovado' | 'reprovado';

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  texto?: string;

  @IsOptional()
  @IsUUID()
  arquivoId?: string | null;
}
