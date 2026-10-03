import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export const INTERESSE_EMPREENDIMENTO_STATUS = [
  'ativo',
  'pausado',
  'convertido',
  'descartado',
] as const;

export class CreateLeadInteresseDto {
  @IsUUID('4', { message: 'Empreendimento inválido.' })
  empreendimentoId!: string;

  @IsOptional()
  @IsIn(INTERESSE_EMPREENDIMENTO_STATUS, { message: 'Status inválido.' })
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observacoes?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsUUID('4', { message: 'Corretor inválido.' })
  corretorId?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsDateString({}, { message: 'Data de interesse inválida.' })
  dataInteresse?: string | null;
}

export class UpdateLeadInteresseDto {
  @IsOptional()
  @IsIn(INTERESSE_EMPREENDIMENTO_STATUS, { message: 'Status inválido.' })
  status?: string;

  @IsOptional()
  @Transform(({ value }) => (value == null ? '' : String(value)))
  @IsString()
  @MaxLength(500)
  observacoes?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsUUID('4', { message: 'Corretor inválido.' })
  corretorId?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsDateString({}, { message: 'Data de interesse inválida.' })
  dataInteresse?: string | null;
}
