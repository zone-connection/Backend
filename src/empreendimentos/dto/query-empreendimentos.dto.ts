import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { Transform } from 'class-transformer';

export class QueryEmpreendimentosDto {
  @IsOptional()
  @IsUUID('4')
  construtoraId?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    if (value === true || value === 'true' || value === '1') return true;
    if (value === false || value === 'false' || value === '0') return false;
    return undefined;
  })
  ativo?: boolean;

  @IsOptional()
  @IsIn(['created_desc', 'created_asc', 'nome_asc', 'nome_desc'], {
    message:
      'Ordenação inválida. Use created_desc, created_asc, nome_asc ou nome_desc.',
  })
  sort?: 'created_desc' | 'created_asc' | 'nome_asc' | 'nome_desc';
}
