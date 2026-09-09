import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import {
  ImovelChaveLocalizacao,
  ImovelChaveStatus,
  VendaUsadoPosVendaPendenciaStatus,
  VendaUsadoPosVendaStatus,
} from '@prisma/client';

export class CreateImovelChaveDto {
  @IsString()
  @MaxLength(120)
  identificacao!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantidade?: number;

  @IsOptional()
  @IsEnum(ImovelChaveLocalizacao)
  localizacaoAtual?: ImovelChaveLocalizacao;

  @IsOptional()
  @IsUUID()
  responsavelAtualId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observacoes?: string;
}

export class UpdateImovelChaveDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  identificacao?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantidade?: number;

  @IsOptional()
  @IsEnum(ImovelChaveStatus)
  status?: ImovelChaveStatus;

  @IsOptional()
  @IsEnum(ImovelChaveLocalizacao)
  localizacaoAtual?: ImovelChaveLocalizacao;

  @IsOptional()
  @IsUUID()
  responsavelAtualId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observacoes?: string;
}

export class MovimentarChaveDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantidade?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  motivo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observacao?: string;

  @IsOptional()
  @IsEnum(ImovelChaveLocalizacao)
  localizacao?: ImovelChaveLocalizacao;

  @IsOptional()
  @IsUUID()
  responsavelId?: string;
}

export class CreatePosVendaDto {
  @IsOptional()
  @IsUUID()
  responsavelId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observacoes?: string;
}

export class UpdatePosVendaDto {
  @IsOptional()
  @IsEnum(VendaUsadoPosVendaStatus)
  status?: VendaUsadoPosVendaStatus;

  @IsOptional()
  @IsUUID()
  responsavelId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observacoes?: string;
}

export class CreatePosVendaPendenciaDto {
  @IsString()
  @MaxLength(160)
  titulo!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  descricao?: string;

  @IsOptional()
  @IsBoolean()
  obrigatoria?: boolean;

  @IsOptional()
  @IsUUID()
  responsavelId?: string;

  @IsOptional()
  @IsDateString()
  prazo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observacao?: string;
}

export class UpdatePosVendaPendenciaDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  titulo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  descricao?: string;

  @IsOptional()
  @IsEnum(VendaUsadoPosVendaPendenciaStatus)
  status?: VendaUsadoPosVendaPendenciaStatus;

  @IsOptional()
  @IsBoolean()
  obrigatoria?: boolean;

  @IsOptional()
  @IsUUID()
  responsavelId?: string;

  @IsOptional()
  @IsDateString()
  prazo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observacao?: string;
}
