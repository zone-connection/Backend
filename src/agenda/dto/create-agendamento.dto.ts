import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export const AGENDAMENTO_TIPOS = [
  'visita',
  'ligacao',
  'reuniao',
  'tarefa',
  'outro',
  'bloqueio',
] as const;

export const AGENDAMENTO_STATUS = [
  'agendado',
  'concluido',
  'cancelado',
] as const;

export const AGENDAMENTO_ESCOPOS = ['pessoal', 'com_gerente'] as const;

export const AGENDAMENTO_ALVOS = [
  'nenhum',
  'todos',
  'equipe',
  'gerente',
  'gerentes',
] as const;

export const AGENDAMENTO_RECURRENCE_FREQ = [
  'unica',
  'semanal',
  'mensal',
] as const;

export class CreateAgendamentoDto {
  /** Opcional em tarefa pessoal; obrigatório quando envolve o gerente. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsUUID('4', { message: 'Lead/cliente inválido.' })
  leadId?: string | null;

  /** Usuário que recebe a tarefa (admin: qualquer; gerente: corretor da equipe). */
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsUUID('4', { message: 'Corretor inválido.' })
  atribuidoParaId?: string | null;

  @IsString()
  @MinLength(2, { message: 'O título deve ter ao menos 2 caracteres.' })
  @MaxLength(160)
  titulo!: string;

  @IsIn(AGENDAMENTO_TIPOS, { message: 'Tipo de compromisso inválido.' })
  tipo!: (typeof AGENDAMENTO_TIPOS)[number];

  /** pessoal = tarefa do corretor; com_gerente = precisa aprovação. */
  @IsIn(AGENDAMENTO_ESCOPOS, { message: 'Escopo inválido.' })
  escopo!: (typeof AGENDAMENTO_ESCOPOS)[number];

  /** Público de eventos do admin (todos / equipe / gerente / gerentes). */
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

  @IsISO8601({}, { message: 'Data/hora de início inválida.' })
  startsAt!: string;

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

  /** Etapa do funil quando a tarefa nasce no quadro. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsString()
  @MaxLength(80)
  funilStage?: string | null;

  /** Recorrência de bloqueio: unica | semanal | mensal. */
  @IsOptional()
  @IsIn(AGENDAMENTO_RECURRENCE_FREQ, {
    message: 'Frequência de recorrência inválida.',
  })
  recurrenceFreq?: (typeof AGENDAMENTO_RECURRENCE_FREQ)[number];

  /** Dias da semana 0–6 (Dom–Sáb) quando semanal. */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  recurrenceDays?: number[];

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsISO8601({}, { message: 'Data final da recorrência inválida.' })
  recurrenceUntil?: string | null;
}
