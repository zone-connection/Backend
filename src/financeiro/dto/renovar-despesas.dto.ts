import { IsString, Matches } from 'class-validator';

export class RenovarDespesasDto {
  /** Competência alvo no formato YYYY-MM. */
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: 'Competência inválida. Use YYYY-MM.',
  })
  competencia!: string;
}
