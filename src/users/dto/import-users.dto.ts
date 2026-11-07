import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Role } from '@prisma/client';
import {
  PASSWORD_REGEX,
  PASSWORD_RULE_MESSAGE,
} from '../../config/security.constants';

export class ImportUserItemDto {
  @IsString()
  @MinLength(2, { message: 'O nome deve ter ao menos 2 caracteres.' })
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @ValidateIf((_, v) => v != null && String(v).trim() !== '')
  @IsString()
  @MaxLength(40)
  creci?: string | null;

  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  @MaxLength(255)
  email!: string;

  @IsString()
  @MaxLength(72, { message: 'A senha deve ter no máximo 72 caracteres.' })
  @Matches(PASSWORD_REGEX, { message: PASSWORD_RULE_MESSAGE })
  password!: string;

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
    { message: 'Acesso inválido. Use corretor, gerente, administrador, analista, trainee ou financeiro.' },
  )
  role!: Role;
}

export class ImportUsersDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Envie ao menos 1 usuário.' })
  @ArrayMaxSize(200, { message: 'Máximo de 200 usuários por importação.' })
  @ValidateNested({ each: true })
  @Type(() => ImportUserItemDto)
  users!: ImportUserItemDto[];
}
