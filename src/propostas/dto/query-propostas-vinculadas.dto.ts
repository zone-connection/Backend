import { IsOptional, IsUUID } from "class-validator";

export class QueryPropostasVinculadasDto {
  @IsOptional()
  @IsUUID()
  empreendimentoId?: string;

  @IsOptional()
  @IsUUID()
  imovelId?: string;
}
