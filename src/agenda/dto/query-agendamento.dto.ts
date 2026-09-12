import { IsIn, IsISO8601, IsOptional, IsUUID } from 'class-validator';
import {
  AGENDAMENTO_STATUS,
  AGENDAMENTO_TIPOS,
} from './create-agendamento.dto';

export class QueryAgendamentoDto {
  /** Admin/gerente: filtra pela agenda de um corretor (ou gerente, se admin). */
  @IsOptional()
  @IsUUID('4', { message: 'Usuário inválido.' })
  corretorId?: string;

  /** Admin/gerente: filtra pela equipe (membros + gerente). */
  @IsOptional()
  @IsUUID('4', { message: 'Equipe inválida.' })
  equipeId?: string;

  @IsOptional()
  @IsIn(AGENDAMENTO_TIPOS, { message: 'Tipo inválido.' })
  tipo?: (typeof AGENDAMENTO_TIPOS)[number];

  @IsOptional()
  @IsIn(AGENDAMENTO_STATUS, { message: 'Status inválido.' })
  status?: (typeof AGENDAMENTO_STATUS)[number];

  /** Início do intervalo (ISO). Filtra startsAt >= from. */
  @IsOptional()
  @IsISO8601({}, { message: 'Data inicial inválida.' })
  from?: string;

  /** Fim do intervalo (ISO). Filtra startsAt <= to. */
  @IsOptional()
  @IsISO8601({}, { message: 'Data final inválida.' })
  to?: string;
}
