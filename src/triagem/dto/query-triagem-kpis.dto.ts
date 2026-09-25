import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class QueryTriagemKpisDto {
  @IsOptional()
  @IsUUID('4', { message: 'Equipe inválida.' })
  equipeId?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  semEquipe?: boolean;
}
