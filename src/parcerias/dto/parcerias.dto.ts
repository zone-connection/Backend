import {
  IsBoolean,
  IsEmail,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  PASSWORD_REGEX,
  PASSWORD_RULE_MESSAGE,
} from '../../config/security.constants';

export class ParceiroLoginDto {
  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  @MaxLength(255)
  email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(72)
  password!: string;
}

export class ConvidarParceiroDto {
  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  @MaxLength(255)
  email!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  nome!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  creci?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  telefone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  imobiliariaOrigem?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  percentualParceiro?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(90)
  slaDias?: number;
}

export class UpdateParceriaDto {
  @IsOptional()
  @Matches(/^(ativa|suspensa|encerrada)$/)
  status?: 'ativa' | 'suspensa' | 'encerrada';

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  percentualParceiro?: number;

  @IsOptional()
  @IsBoolean()
  podeVerEstoque?: boolean;

  @IsOptional()
  @IsBoolean()
  podeReceberLead?: boolean;

  @IsOptional()
  @IsBoolean()
  podeIndicar?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(90)
  slaDias?: number;
}

export class LiberarImovelDto {
  @IsBoolean()
  liberado!: boolean;
}

export class InteresseDto {
  @IsUUID()
  imovelId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  mensagem?: string;
}

export class CompartilharLeadDto {
  @IsUUID()
  leadId!: string;
}

export class IndicarClienteDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  nome!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(30)
  telefone!: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsUUID()
  imovelId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notas?: string;
}

export class CreateRepasseDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  descricao!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  valor!: number;

  @IsOptional()
  @Matches(/^(prevista|devida|paga)$/)
  status?: 'prevista' | 'devida' | 'paga';
}

export class ChangeParceiroPasswordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(72)
  senhaAtual!: string;

  @IsString()
  @MaxLength(72)
  @Matches(PASSWORD_REGEX, { message: PASSWORD_RULE_MESSAGE })
  senhaNova!: string;
}
