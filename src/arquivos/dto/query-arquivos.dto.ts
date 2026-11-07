import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { ArquivoCategoria, ArquivoVinculoTipo } from '@prisma/client';

export class QueryArquivosDto {
  @IsEnum(ArquivoVinculoTipo)
  entityType: ArquivoVinculoTipo;

  @IsUUID()
  entityId: string;

  @IsOptional()
  @IsEnum(ArquivoCategoria)
  categoria?: ArquivoCategoria;
}
