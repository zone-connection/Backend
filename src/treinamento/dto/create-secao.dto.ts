import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

function emptyToNull({ value }: { value: unknown }) {
  if (value === undefined || value === null || value === '') return null;
  return value;
}

export class CreateTreinamentoSecaoDto {
  @IsString()
  @MinLength(2, { message: 'O nome deve ter ao menos 2 caracteres.' })
  @MaxLength(80)
  titulo!: string;

  @IsOptional()
  @Transform(emptyToNull)
  @IsUUID('4', { message: 'Seção pai inválida.' })
  parentId?: string | null;
}
