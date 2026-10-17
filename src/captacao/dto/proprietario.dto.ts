import { PessoaTipo } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class CreateProprietarioDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  nome!: string;

  @IsOptional()
  @IsEnum(PessoaTipo)
  tipoPessoa?: PessoaTipo;

  @IsOptional()
  @IsString()
  @MaxLength(18)
  cpfCnpj?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  telefone?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== '' && v != null)
  @IsEmail()
  @MaxLength(160)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observacoes?: string;
}

export class UpdateProprietarioDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  nome?: string;

  @IsOptional()
  @IsEnum(PessoaTipo)
  tipoPessoa?: PessoaTipo;

  @IsOptional()
  @IsString()
  @MaxLength(18)
  cpfCnpj?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  telefone?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== '' && v != null)
  @IsEmail()
  @MaxLength(160)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observacoes?: string;
}

export class QueryProprietariosDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  search?: string;
}
