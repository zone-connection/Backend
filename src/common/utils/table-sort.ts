import { IsIn, IsOptional } from 'class-validator';

export const TABLE_SORT_VALUES = [
  'created_desc',
  'created_asc',
  'nome_asc',
  'nome_desc',
] as const;

export type TableSort = (typeof TABLE_SORT_VALUES)[number];

export class TableSortQueryDto {
  @IsOptional()
  @IsIn(TABLE_SORT_VALUES, {
    message:
      'Ordenação inválida. Use created_desc, created_asc, nome_asc ou nome_desc.',
  })
  sort?: TableSort;
}

type SortDir = 'asc' | 'desc';

/** Prisma `orderBy` para listas: criação ou nome alfabético. */
export function prismaTableOrderBy(
  sort: string | undefined,
  nameField: 'nome' | 'name' | 'clienteNome' = 'nome',
): Record<string, SortDir> {
  const alphabetical = sort === 'nome_asc' || sort === 'nome_desc';
  const dir: SortDir = sort?.endsWith('_asc') ? 'asc' : 'desc';
  if (alphabetical) {
    return { [nameField]: dir };
  }
  return { createdAt: sort === 'created_asc' ? 'asc' : 'desc' };
}
