import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  PASSWORD_REGEX,
  PASSWORD_RULE_MESSAGE,
} from '../../config/security.constants';

export class PortalLoginDto {
  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  @MaxLength(255)
  email!: string;

  @IsString()
  @MinLength(1, { message: 'A senha é obrigatória.' })
  @MaxLength(72)
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'tenantSlug inválido.',
  })
  tenantSlug?: string;
}

export class PortalForgotPasswordDto {
  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'tenantSlug inválido.',
  })
  tenantSlug?: string;
}

export class PortalResetPasswordDto {
  @IsString()
  @MinLength(1, { message: 'O token é obrigatório.' })
  @MaxLength(200)
  token!: string;

  @IsString()
  @MaxLength(72, { message: 'A senha deve ter no máximo 72 caracteres.' })
  @Matches(PASSWORD_REGEX, { message: PASSWORD_RULE_MESSAGE })
  password!: string;
}

export class ChangePortalPasswordDto {
  @IsString()
  @MinLength(1, { message: 'A senha atual é obrigatória.' })
  @MaxLength(72)
  senhaAtual!: string;

  @IsString()
  @MaxLength(72, { message: 'A senha deve ter no máximo 72 caracteres.' })
  @Matches(PASSWORD_REGEX, { message: PASSWORD_RULE_MESSAGE })
  senhaNova!: string;
}

export class PortalAcaoDto {
  @IsString()
  @Matches(/^(vi_e_concordo|quero_falar)$/, {
    message: 'Ação inválida.',
  })
  tipo!: 'vi_e_concordo' | 'quero_falar';
}

export class UpdateProprietarioPortalDto {
  @IsBoolean()
  ativo!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(72)
  @Matches(PASSWORD_REGEX, { message: PASSWORD_RULE_MESSAGE })
  senha?: string;

  /** Gera e devolve uma senha temporária (só nesta resposta). */
  @IsOptional()
  @IsBoolean()
  gerarSenhaTemporaria?: boolean;
}
