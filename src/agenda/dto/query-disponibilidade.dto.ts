import { IsISO8601, IsOptional, IsUUID, ValidateIf } from 'class-validator';

export class QueryDisponibilidadeDto {
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsUUID('4', { message: 'Empreendimento inválido.' })
  empreendimentoId?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsUUID('4', { message: 'Imóvel inválido.' })
  imovelId?: string;

  @IsISO8601({}, { message: 'Início do dia inválido.' })
  from!: string;

  @IsISO8601({}, { message: 'Fim do dia inválido.' })
  to!: string;
}
