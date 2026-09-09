import { CreciProcessoStatus, Role, UserStatus } from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  PASSWORD_REGEX,
  PASSWORD_RULE_MESSAGE,
} from '../../config/security.constants';

export class CreateUserDto {
  @IsString()
  @MinLength(2, { message: 'O nome deve ter ao menos 2 caracteres.' })
  @MaxLength(120)
  name!: string;

  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  @MaxLength(255)
  email!: string;

  @IsString()
  @MaxLength(72, { message: 'A senha deve ter no máximo 72 caracteres.' })
  @Matches(PASSWORD_REGEX, { message: PASSWORD_RULE_MESSAGE })
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  whatsapp?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsDateString({}, { message: 'Data de nascimento inválida.' })
  dataNascimento?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  cargo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  creci?: string;

  @IsOptional()
  @IsEnum(CreciProcessoStatus, { message: 'Andamento do CRECI inválido.' })
  creciStatus?: CreciProcessoStatus;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: 'Informe a cor no formato #RRGGBB.',
  })
  cor?: string | null;

  @IsIn(
    [
      Role.admin,
      Role.gerente,
      Role.corretor,
      Role.analista,
      Role.treinee,
      Role.financeiro,
      Role.assistente,
    ],
    {
      message: 'Perfil inválido.',
    },
  )
  role!: Role;

  @IsOptional()
  @IsBoolean()
  financeiroCanView?: boolean;

  @IsOptional()
  @IsBoolean()
  financeiroCanCreate?: boolean;

  @IsOptional()
  @IsBoolean()
  financeiroCanEdit?: boolean;

  @IsOptional()
  @IsBoolean()
  financeiroCanDelete?: boolean;

  @IsOptional()
  @IsObject()
  permissions?: {
    modules?: Record<string, boolean>;
    actions?: Record<string, boolean>;
  };

  @IsOptional()
  @IsEnum(UserStatus, { message: 'Status inválido.' })
  status?: UserStatus;

  @IsOptional()
  @IsString()
  avatar?: string;
}
