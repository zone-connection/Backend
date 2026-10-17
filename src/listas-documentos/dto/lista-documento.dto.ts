import { Type } from 'class-transformer';
import {
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class ListaDocumentoItemInput {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  titulo!: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  descricao?: string;
}

export class CreateListaDocumentoDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  nome!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  intro?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  aviso?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ListaDocumentoItemInput)
  itens?: ListaDocumentoItemInput[];
}

export class UpdateListaDocumentoDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  nome?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  intro?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  aviso?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ListaDocumentoItemInput)
  itens?: ListaDocumentoItemInput[];
}
