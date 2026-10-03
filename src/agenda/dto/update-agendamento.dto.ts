import {
  IsBoolean,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  AGENDAMENTO_ALVOS,
  AGENDAMENTO_ESCOPOS,
  AGENDAMENTO_STATUS,
  AGENDAMENTO_TIPOS,
} from './create-agendamento.dto';

/** Atualização parcial — o vínculo com o lead não muda. */
export class UpdateAgendamentoDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'O título deve ter ao menos 2 caracteres.' })
  @MaxLength(160)
  titulo?: string;

  @IsOptional()
  @IsIn(AGENDAMENTO_TIPOS, { message: 'Tipo de compromisso inválido.' })
  tipo?: (typeof AGENDAMENTO_TIPOS)[number];

  @IsOptional()
  @IsIn(AGENDAMENTO_ESCOPOS, { message: 'Escopo inválido.' })
  escopo?: (typeof AGENDAMENTO_ESCOPOS)[number];

  @IsOptional()
  @IsIn(AGENDAMENTO_STATUS, { message: 'Status inválido.' })
  status?: (typeof AGENDAMENTO_STATUS)[number];

  @IsOptional()
  @IsIn(AGENDAMENTO_ALVOS, { message: 'Público do evento inválido.' })
  alvoTipo?: (typeof AGENDAMENTO_ALVOS)[number];

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsUUID('4', { message: 'Equipe inválida.' })
  alvoEquipeId?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsUUID('4', { message: 'Gerente inválido.' })
  alvoGerenteId?: string | null;

  @IsOptional()
  @IsISO8601({}, { message: 'Data/hora de início inválida.' })
  startsAt?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsISO8601({}, { message: 'Data/hora de término inválida.' })
  endsAt?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsString()
  @MaxLength(160)
  local?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsString()
  @MaxLength(2000)
  observacoes?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsUUID('4', { message: 'Empreendimento inválido.' })
  empreendimentoId?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsUUID('4', { message: 'Imóvel inválido.' })
  imovelId?: string | null;

  @IsOptional()
  @IsBoolean()
  toleranciaAtiva?: boolean;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsUUID('4', { message: 'Chave inválida.' })
  muralChaveId?: string | null;
}
