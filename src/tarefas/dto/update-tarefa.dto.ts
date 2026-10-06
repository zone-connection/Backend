import { PartialType } from '@nestjs/mapped-types';
import { IsIn, IsOptional } from 'class-validator';
import { CreateTarefaDto } from './create-tarefa.dto';

export class UpdateTarefaDto extends PartialType(CreateTarefaDto) {
  @IsOptional()
  @IsIn(['aberta', 'concluida'])
  status?: 'aberta' | 'concluida';
}
