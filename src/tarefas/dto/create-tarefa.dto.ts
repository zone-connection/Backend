import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export const TAREFA_PRIORIDADES = ['alta', 'media', 'baixa'] as const;
export const TAREFA_TIPOS = [
  'visita',
  'ligacao',
  'reuniao',
  'tarefa',
  'outro',
  'bloqueio',
  'retirada_chave',
] as const;
export const TAREFA_RECORRENCIAS = [
  'nenhuma',
  'diaria',
  'semanal',
  'mensal',
  'dias_especificos',
  'personalizado',
] as const;
export const TAREFA_LEMBRETES = [
  'nenhum',
  'no_horario',
  'min_5',
  'min_15',
  'min_30',
  'hora_1',
  'dia_1',
  'personalizado',
] as const;

export class CreateTarefaDto {
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  titulo!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Data inválida.' })
  data!: string;

  @IsUUID('4', { message: 'Responsável inválido.' })
  responsavelId!: string;

  @IsOptional()
  @Matches(/^\d{2}:\d{2}$/, { message: 'Horário inválido.' })
  horario?: string;

  @IsOptional()
  @IsIn(TAREFA_PRIORIDADES)
  prioridade?: (typeof TAREFA_PRIORIDADES)[number];

  @IsOptional()
  @IsIn(TAREFA_TIPOS)
  tipo?: (typeof TAREFA_TIPOS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  descricao?: string;

  @IsOptional()
  @IsIn(TAREFA_LEMBRETES)
  lembrete?: (typeof TAREFA_LEMBRETES)[number];

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60 * 24 * 30)
  lembreteMinutos?: number;

  @IsOptional()
  @IsIn(TAREFA_RECORRENCIAS)
  recorrencia?: (typeof TAREFA_RECORRENCIAS)[number];

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  diasSemana?: number[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  intervaloDias?: number;

  @IsOptional()
  @IsUUID('4')
  leadId?: string;

  @IsOptional()
  @IsUUID('4')
  agendamentoId?: string;

  @IsOptional()
  @IsUUID('4')
  imovelId?: string;
}
