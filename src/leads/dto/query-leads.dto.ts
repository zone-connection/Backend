import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { LEAD_INTERESSES, LEAD_PRIORIDADES, CONTATO_TIPOS } from '../lead.constants';

export class QueryLeadsDto {
  @IsOptional()
  @IsString()
  search?: string;

  /** Filtra por tipo. Omitido = lead e cliente (ex.: funil). */
  @IsOptional()
  @IsIn(CONTATO_TIPOS, { message: 'Tipo inválido. Use lead ou cliente.' })
  tipo?: string;

  @IsOptional()
  @IsString()
  stage?: string;

  @IsOptional()
  @IsIn(LEAD_INTERESSES, { message: 'Interesse inválido.' })
  interesse?: string;

  @IsOptional()
  @IsIn(LEAD_PRIORIDADES, { message: 'Prioridade inválida.' })
  prioridade?: string;

  /** Filtra por origem do lead (valor cadastrado no catálogo). */
  @IsOptional()
  @IsString()
  origem?: string;

  /** Filtra por corretor. Ignorado para o perfil corretor (sempre os próprios leads). */
  @IsOptional()
  @IsUUID('4', { message: 'Corretor inválido.' })
  corretorId?: string;

  /** Filtra por equipe (pool + leads de corretores da equipe). */
  @IsOptional()
  @IsUUID('4', { message: 'Equipe inválida.' })
  equipeId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number = 20;

  @IsOptional()
  @IsIn(['created_desc', 'created_asc', 'nome_asc', 'nome_desc'], {
    message:
      'Ordenação inválida. Use created_desc, created_asc, nome_asc ou nome_desc.',
  })
  sort?: 'created_desc' | 'created_asc' | 'nome_asc' | 'nome_desc';

  /** Filtro de monitoramento de prazo/inatividade (calculado no backend). */
  @IsOptional()
  @IsIn(
    [
      'todos',
      'sem_movimentacao',
      'proximo_vencimento',
      'em_atraso',
      'dentro_prazo',
    ],
    {
      message:
        'Filtro de monitoramento inválido. Use todos, sem_movimentacao, proximo_vencimento, em_atraso ou dentro_prazo.',
    },
  )
  monitoramento?:
    | 'todos'
    | 'sem_movimentacao'
    | 'proximo_vencimento'
    | 'em_atraso'
    | 'dentro_prazo';
}
