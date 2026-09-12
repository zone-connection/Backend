import { IsIn, IsInt, IsOptional, IsUUID, Min } from 'class-validator';

export const META_TIPOS = ['vendas', 'documentacoes', 'vgv'] as const;
export const META_PERIODOS = [
  'diaria',
  'semanal',
  'mensal',
  'trimestral',
  'semestral',
  'anual',
] as const;
export const META_ESCOPOS = ['corretor', 'gerente', 'imobiliaria'] as const;

export class CreateMetaDto {
  /**
   * Escopo da meta. Corretor/gerente usam `corretor` (padrão).
   * Admin pode criar `imobiliaria`, `gerente` ou `corretor`.
   */
  @IsOptional()
  @IsIn(META_ESCOPOS, { message: 'Escopo de meta inválido.' })
  escopo?: (typeof META_ESCOPOS)[number];

  /**
   * Obrigatório para gerente e para admin com escopo=corretor.
   * Ignorado para corretor (sempre self) e para escopos imobiliaria/gerente.
   */
  @IsOptional()
  @IsUUID('4', { message: 'Corretor inválido.' })
  corretorId?: string;

  /** Obrigatório para admin com escopo=gerente. */
  @IsOptional()
  @IsUUID('4', { message: 'Gerente inválido.' })
  gerenteId?: string;

  @IsIn(META_TIPOS, { message: 'Indicador de meta inválido.' })
  tipo!: (typeof META_TIPOS)[number];

  @IsIn(META_PERIODOS, { message: 'Período de meta inválido.' })
  periodo!: (typeof META_PERIODOS)[number];

  @IsInt({ message: 'O valor da meta deve ser um número inteiro.' })
  @Min(1, { message: 'O valor da meta deve ser maior que zero.' })
  valor!: number;
}
