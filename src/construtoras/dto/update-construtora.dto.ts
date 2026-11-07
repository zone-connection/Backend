import { Transform } from 'class-transformer';
import {
  IsArray,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

const HEX_COR = /^#[0-9A-Fa-f]{6}$/;

export class UpdateConstrutoraDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'O nome deve ter ao menos 2 caracteres.' })
  @MaxLength(120)
  nome?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsString()
  @Matches(HEX_COR, { message: 'Informe a cor no formato #RRGGBB.' })
  cor?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  contato?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  endereco?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  viabilizadorNome?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  viabilizadorContato?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  cca?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsUrl(
    { require_protocol: true, protocols: ['https'] },
    { message: 'Informe uma URL https válida da pasta no Drive.' },
  )
  @MaxLength(500)
  driveFolderUrl?: string | null;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    return Array.isArray(value) ? value.map(String) : [String(value)];
  })
  @IsArray()
  @IsUUID('4', { each: true, message: 'Localidade inválida.' })
  localidadeIds?: string[];
}
