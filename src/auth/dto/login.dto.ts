import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  @MaxLength(255)
  email!: string;

  @IsString()
  @MinLength(1, { message: 'A senha é obrigatória.' })
  // bcrypt trunca em 72 bytes; limitar aqui evita hash de payload gigante (DoS).
  @MaxLength(72)
  password!: string;

  /** Slug do tenant quando o mesmo e-mail existe em mais de uma imobiliária. */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'tenantSlug inválido.',
  })
  tenantSlug?: string;

  /** Token do Cloudflare Turnstile. Obrigatório em produção. */
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  captchaToken?: string;
}
