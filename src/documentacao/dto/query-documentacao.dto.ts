import { IsBoolean, IsIn, IsOptional, IsUUID } from 'class-validator';
import { Transform } from 'class-transformer';

export class QueryDocumentacaoDto {
  /** Admin/gerente: filtra fichas cujo lead pertence a este corretor. */
  @IsOptional()
  @IsUUID('4', { message: 'Corretor inválido.' })
  corretorId?: string;

  @IsOptional()
  @IsIn(['created_desc', 'created_asc', 'nome_asc', 'nome_desc'], {
    message:
      'Ordenação inválida. Use created_desc, created_asc, nome_asc ou nome_desc.',
  })
  sort?: 'created_desc' | 'created_asc' | 'nome_asc' | 'nome_desc';

  /** Inclui fichas sintéticas de comissão (ex.: tela de Vendas). */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  incluirComissoes?: boolean;
}
