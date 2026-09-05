import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { HEX_COR_REGEX } from '../../common/utils/cor';

export class UpdateAppearanceDto {
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== '')
  @IsString()
  @MinLength(3, { message: 'Informe o CRECI com ao menos 3 caracteres.' })
  @MaxLength(40, { message: 'O CRECI deve ter no máximo 40 caracteres.' })
  creci?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== '')
  @IsString()
  @Matches(HEX_COR_REGEX, {
    message: 'Informe a cor do aside no formato #RRGGBB.',
  })
  corAside?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== '')
  @IsString()
  @Matches(HEX_COR_REGEX, {
    message: 'Informe a cor principal no formato #RRGGBB.',
  })
  corPrincipal?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== '')
  @IsString()
  @Matches(HEX_COR_REGEX, {
    message: 'Informe a cor lateral dos módulos no formato #RRGGBB.',
  })
  corModulo?: string | null;
}
