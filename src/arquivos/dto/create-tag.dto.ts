import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateDocumentoTagDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  nome: string;
}

export class UpdateDocumentoTagDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  nome?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
