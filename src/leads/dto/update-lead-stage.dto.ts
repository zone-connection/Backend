import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';

function toOptionalInt({ value }: { value: unknown }) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  return Number(value);
}

/**
 * Movimenta o lead entre as etapas do funil.
 * A etapa é validada dinamicamente contra o funil ativo no LeadsService.
 * Construtora, empreendimento e dados financeiros são opcionais:
 * a documentação é cadastrada depois pelo analista.
 */
export class UpdateLeadStageDto {
  @IsString()
  @MaxLength(60)
  stage!: string;

  @IsOptional()
  @IsUUID('4', { message: 'Construtora inválida.' })
  construtoraId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'Empreendimento inválido.' })
  empreendimentoId?: string;

  /**
   * Quando true, não cria o evento automático na Triagem.
   * Usado pelo funil quando o modal de relato registra o único acontecimento.
   */
  @IsOptional()
  @IsBoolean()
  omitTriagem?: boolean;

  /** Condições do cliente capturadas no envio para análise (vão para a ficha Analise). */
  @IsOptional()
  @IsBoolean()
  temEntrada?: boolean;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @Transform(toOptionalInt)
  @IsInt()
  @Min(0)
  valorEntrada?: number | null;

  @IsOptional()
  @IsBoolean()
  temFgts?: boolean;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @Transform(toOptionalInt)
  @IsInt()
  @Min(0)
  valorFgts?: number | null;

  @IsOptional()
  @IsBoolean()
  temDependente?: boolean;
}
