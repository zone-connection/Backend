import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export const TRIAGEM_ORIGENS = ['funil', 'manual'] as const;

export class CreateTriagemDto {
  @IsUUID('4', { message: 'Lead inválido.' })
  leadId!: string;

  @IsString()
  @MinLength(1, { message: 'Informe o relato.' })
  @MaxLength(400, { message: 'O relato deve ter no máximo 400 caracteres.' })
  texto!: string;

  @IsIn(TRIAGEM_ORIGENS, { message: 'Origem inválida. Use funil ou manual.' })
  origem!: (typeof TRIAGEM_ORIGENS)[number];

  /** Se informado e diferente da etapa atual, avança o lead na mesma transação. */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  stage?: string;

  /**
   * Etapa de origem quando o funil já avançou o lead e o relato é registrado
   * depois (um único acontecimento com from→to).
   */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  stageAnterior?: string;
}
