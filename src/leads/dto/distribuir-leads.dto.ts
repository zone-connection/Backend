import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class DistribuirEquipeItemDto {
  @IsUUID('4')
  equipeId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  quantidade!: number;
}

/** Admin/gerente: divide leads do pool do admin entre equipes. */
export class DistribuirEquipesDto {
  @IsIn(['equipes'])
  modo!: 'equipes';

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => DistribuirEquipeItemDto)
  alocacoes!: DistribuirEquipeItemDto[];
}

export class DistribuirCorretorItemDto {
  @IsUUID('4')
  corretorId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  quantidade!: number;
}

/**
 * Admin/gerente: envia leads do pool do admin aos corretores.
 * - `alocacoes`: quantidades por corretor (preferido)
 * - `porCorretor`: round-robin legado entre todos os ativos
 */
export class DistribuirCorretoresDto {
  @IsIn(['corretores'])
  modo!: 'corretores';

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => DistribuirCorretorItemDto)
  alocacoes?: DistribuirCorretorItemDto[];

  /** Quantidade que cada corretor recebe por rodada (só se não houver alocacoes). */
  @ValidateIf((o: DistribuirCorretoresDto) => !o.alocacoes?.length)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  porCorretor?: number;
}
