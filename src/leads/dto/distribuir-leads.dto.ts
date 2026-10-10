import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

const LEAD_IDS_MAX = 500;

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
 * Admin/gerente: envia leads aos corretores.
 * - `leadIds`: só esses leads (marcados na lista). Sem isso, usa o pool do admin.
 * - `alocacoes`: quantidades por corretor (preferido)
 * - `porCorretor`: round-robin legado entre todos os ativos
 */
export class DistribuirCorretoresDto {
  @IsIn(['corretores'])
  modo!: 'corretores';

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(LEAD_IDS_MAX)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  leadIds?: string[];

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
