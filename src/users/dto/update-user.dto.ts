import { CreciProcessoStatus, Role, UserStatus } from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MinLength,
  MaxLength,
  ValidateIf,
} from 'class-validator';

/** Atualização de usuário: todos os campos opcionais. A senha é trocada
 * por endpoints dedicados (reset/change password). */
export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'O nome deve ter ao menos 2 caracteres.' })
  name?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  whatsapp?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsDateString({}, { message: 'Data de nascimento inválida.' })
  dataNascimento?: string | null;

  @IsOptional()
  @IsString()
  cargo?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsString()
  @MaxLength(40)
  creci?: string | null;

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

  @IsOptional()
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
  role?: Role;

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
