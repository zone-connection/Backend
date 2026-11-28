import { IsInt, IsString, IsUUID, Min, MinLength } from 'class-validator';

export class RegistrarVendaFunilDto {
  @IsUUID()
  leadId!: string;

  @IsUUID()
  construtoraId!: string;

  @IsUUID()
  empreendimentoId!: string;

  @IsInt()
  @Min(1)
  vgv!: number;

  /** Data civil yyyy-mm-dd. */
  @IsString()
  @MinLength(10)
  dataVenda!: string;
}
