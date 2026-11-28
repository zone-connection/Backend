import { IsString, IsUUID, MinLength } from 'class-validator';

export class AbrirFichaGuiadaDto {
  @IsUUID()
  leadId!: string;

  @IsString()
  @MinLength(1)
  nome!: string;

  @IsUUID()
  construtoraId!: string;

  @IsUUID()
  empreendimentoId!: string;

  @IsString()
  @MinLength(1, { message: 'Informe a fonte.' })
  fonte!: string;
}
