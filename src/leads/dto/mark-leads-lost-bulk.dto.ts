import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

const BULK_MAX = 500;

/** Soft-delete operacional em lote (Leads Perdidos / Perda de cliente). */
export class MarkLeadsLostBulkDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Selecione ao menos 1 registro.' })
  @ArrayMaxSize(BULK_MAX, {
    message: `Máximo de ${BULK_MAX} registros por vez.`,
  })
  @ArrayUnique()
  @IsUUID('4', { each: true })
  ids!: string[];

  @IsString()
  @MinLength(2, { message: 'Informe o motivo da exclusão.' })
  @MaxLength(200)
  motivo!: string;
}

/** Exclusão definitiva em lote (só leads já perdidos). */
export class RemoveLeadsBulkDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Selecione ao menos 1 registro.' })
  @ArrayMaxSize(BULK_MAX, {
    message: `Máximo de ${BULK_MAX} registros por vez.`,
  })
  @ArrayUnique()
  @IsUUID('4', { each: true })
  @Type(() => String)
  ids!: string[];
}
