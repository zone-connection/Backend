import { IsEnum, IsIn, IsOptional, IsUUID } from 'class-validator';
import { PropostaStatus } from '@prisma/client';

export class QueryPropostaDto {
  @IsOptional()
  @IsUUID('4')
  corretorId?: string;

  @IsOptional()
  @IsEnum(PropostaStatus)
  status?: PropostaStatus;

  @IsOptional()
  @IsIn(['created_desc', 'created_asc', 'nome_asc', 'nome_desc'], {
    message:
      'Ordenação inválida. Use created_desc, created_asc, nome_asc ou nome_desc.',
  })
  sort?: 'created_desc' | 'created_asc' | 'nome_asc' | 'nome_desc';
}
