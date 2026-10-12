import { IsOptional, IsUUID } from "class-validator";

export class CreatePropostaVinculoDto {
  @IsOptional()
  @IsUUID()
  imovelId?: string;

  @IsOptional()
  @IsUUID()
  empreendimentoId?: string;
}
