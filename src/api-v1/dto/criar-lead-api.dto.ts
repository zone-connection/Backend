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
import { LEAD_CATEGORIAS, LEAD_INTERESSES, LEAD_PRIORIDADES } from '../../leads/lead.constants';

export class CriarLeadApiDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  nome!: string;

  @IsString()
  @Matches(/^\(\d{2}\) \d{4,5}-\d{4}$/, {
    message: 'Telefone inválido. Use o formato (81) 99999-9999.',
  })
  @MaxLength(20)
  telefone!: string;

  @IsIn(LEAD_INTERESSES, { message: 'Interesse inválido.' })
  interesse!: string;

  @IsOptional()
  @IsIn(LEAD_CATEGORIAS, { message: 'Categoria inválida. Use aluguel ou potencial.' })
  categoria?: 'aluguel' | 'potencial';

  @IsString()
  @MaxLength(80)
  cidade!: string;

  @IsString()
  @MaxLength(80)
  bairro!: string;

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
  @IsString()
  @MaxLength(60)
  stage?: string;

  @IsOptional()
  @IsIn(LEAD_PRIORIDADES, { message: 'Prioridade inválida.' })
  prioridade?: string;
}
