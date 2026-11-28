import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class ImportVendaLinhaDto {
  @IsString()
  corretor!: string;

  @IsString()
  lead!: string;

  @IsOptional()
  @IsString()
  equipe?: string;

  @IsString()
  dataVenda!: string;

  @IsString()
  construtora!: string;

  @IsString()
  empreendimento!: string;

  @IsInt()
  @Min(1)
  vgv!: number;
}

export class ImportVendasDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ImportVendaLinhaDto)
  linhas!: ImportVendaLinhaDto[];
}
