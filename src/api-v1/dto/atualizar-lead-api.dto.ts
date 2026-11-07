import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { LEAD_INTERESSES, LEAD_PRIORIDADES } from '../../leads/lead.constants';

export class AtualizarLeadApiDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  nome?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\(\d{2}\) \d{4,5}-\d{4}$/, {
    message: 'Telefone inválido. Use o formato (81) 99999-9999.',
  })
  @MaxLength(20)
  telefone?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined && value !== '')
  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  origem?: string;

  @IsOptional()
  @IsIn(LEAD_INTERESSES, { message: 'Interesse inválido.' })
  interesse?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  cidade?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  bairro?: string;

  @IsOptional()
  @IsIn(LEAD_PRIORIDADES, { message: 'Prioridade inválida.' })
  prioridade?: string;
}
