import { IsUUID } from "class-validator";

export class CreatePropostaLinkDto {
  @IsUUID("4", { message: "Imóvel inválido." })
  imovelId!: string;
}
