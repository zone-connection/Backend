import { ProcessoEtapa } from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
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

export class MoverEtapaProcessoDto {
  @IsEnum(ProcessoEtapa)
  etapa: ProcessoEtapa;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observacao?: string;
}

export class CreatePendenciaProcessoDto {
  @IsString()
  @MaxLength(160)
  titulo: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  descricao?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  textoComplementar?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID('4', { each: true })
  arquivoIds?: string[];
}

export class CreateCorrecaoPendenciaDto {
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  comentario?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID('4', { each: true })
  arquivoIds?: string[];
}
