import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateTreinamentoSecaoDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'O nome deve ter ao menos 2 caracteres.' })
  @MaxLength(80)
  titulo?: string;
}
