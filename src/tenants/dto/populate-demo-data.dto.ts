import { IsBoolean, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * Popula um tenant com dados de demonstração (super_admin).
 * `limparAntes` apaga os dados operacionais atuais antes de gerar os novos.
 * `volumeExtra` acrescenta ~75% de registros (leads, imóveis, agenda…).
 */
export class PopulateDemoDataDto {
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  limparAntes?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  volumeExtra?: boolean;
}
