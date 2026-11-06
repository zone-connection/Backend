import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { UserStatus } from '@prisma/client';

export class LancamentoDto {
  @IsOptional()
  @IsString()
  @MaxLength(10)
  codigo?: string;

  @IsString()
  @MinLength(1, { message: 'Informe a descrição.' })
  @MaxLength(120)
  descricao!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  referencia?: string;

  @Type(() => Number)
  @IsNumber({}, { message: 'Valor inválido.' })
  @Min(0, { message: 'O valor não pode ser negativo.' })
  valor!: number;
}

export class CreateFuncionarioDto {
  @IsString()
  @MinLength(2, { message: 'O nome deve ter ao menos 2 caracteres.' })
  @MaxLength(160)
  nome!: string;

  @IsString()
  @MinLength(2, { message: 'Informe o cargo.' })
  @MaxLength(120)
  cargo!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  empresa?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  codigo?: string;

  @IsOptional()
  @IsDateString()
  dataAdmissao?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  cbo?: string;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @Type(() => Number)
  @IsNumber({}, { message: 'Salário bruto inválido.' })
  @Min(0)
  salarioBruto!: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => LancamentoDto)
  beneficios?: LancamentoDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => LancamentoDto)
  descontos?: LancamentoDto[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observacoes?: string;
}

export class UpdateFuncionarioDto extends CreateFuncionarioDto {}
