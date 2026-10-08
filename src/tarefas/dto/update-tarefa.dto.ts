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
import {
  TAREFA_LEMBRETES,
  TAREFA_PRIORIDADES,
  TAREFA_RECORRENCIAS,
  TAREFA_TIPOS,
} from './create-tarefa.dto';

export class UpdateTarefaDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  titulo?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Data inválida.' })
  data?: string;

  @IsOptional()
  @IsUUID('4', { message: 'Responsável inválido.' })
  responsavelId?: string;

  @IsOptional()
  @Matches(/^\d{2}:\d{2}$/, { message: 'Horário inválido.' })
  horario?: string;

  @IsOptional()
  @IsIn(TAREFA_TIPOS)
  tipo?: (typeof TAREFA_TIPOS)[number];

  @IsOptional()
  @IsIn(TAREFA_PRIORIDADES)
  prioridade?: (typeof TAREFA_PRIORIDADES)[number];

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

  @IsOptional()
  @IsIn(['aberta', 'concluida'])
  status?: 'aberta' | 'concluida';
}
