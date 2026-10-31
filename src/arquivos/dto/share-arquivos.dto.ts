import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsUUID,
} from 'class-validator';
import { ArquivoVinculoTipo } from '@prisma/client';

export class ZipArquivosDto {
  @IsEnum(ArquivoVinculoTipo)
  entityType: ArquivoVinculoTipo;

  @IsUUID()
  entityId: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  ids?: string[];
}

export class ShareArquivosDto extends ZipArquivosDto {
  @IsEmail()
  email: string;

  @IsOptional()
  @IsBoolean()
  all?: boolean;
}
