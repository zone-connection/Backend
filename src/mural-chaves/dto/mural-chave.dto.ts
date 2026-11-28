import { MuralChaveLocal, MuralChaveStatus } from '@prisma/client';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateMuralChaveDto {
  @IsString()
  @MaxLength(40)
  identificador!: string;

  @IsString()
  @MaxLength(40)
  tipo!: string;

  @IsOptional()
  @IsUUID()
  empreendimentoId?: string;

  @IsOptional()
  @IsUUID()
  imovelId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  unidade?: string;

  @IsOptional()
  @IsEnum(MuralChaveLocal)
  local?: MuralChaveLocal;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  localDescricao?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observacoes?: string;
}

export class UpdateMuralChaveDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  identificador?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  tipo?: string;

  @IsOptional()
  @IsUUID()
  empreendimentoId?: string | null;

  @IsOptional()
  @IsUUID()
  imovelId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  unidade?: string;

  @IsOptional()
  @IsEnum(MuralChaveLocal)
  local?: MuralChaveLocal;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  localDescricao?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observacoes?: string;
}

export class RetirarMuralChaveDto {
  @IsOptional()
  @IsString()
  previsaoDevolucao?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observacao?: string;
}

export class RetiradaManualMuralChaveDto {
  @IsUUID()
  corretorId!: string;

  @IsOptional()
  @IsString()
  retiradaEm?: string;

  @IsOptional()
  @IsString()
  previsaoDevolucao?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observacao?: string;
}

export class DevolverMuralChaveDto {
  @IsEnum(MuralChaveLocal)
  local!: MuralChaveLocal;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  localDescricao?: string;

  @IsOptional()
  @IsString()
  devolucaoEm?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observacao?: string;
}

export class ConfirmarDevolucaoMuralChaveDto {
  @IsUUID()
  entregueParaId!: string;
}

export class QueryMuralChavesDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;

  @IsOptional()
  @IsEnum(MuralChaveStatus)
  status?: MuralChaveStatus;

  @IsOptional()
  @IsUUID()
  empreendimentoId?: string;
}
