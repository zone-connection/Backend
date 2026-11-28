import { IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateTriagemDto {
  @IsString()
  @MinLength(1, { message: 'Informe o relato.' })
  @MaxLength(400, { message: 'O relato deve ter no máximo 400 caracteres.' })
  texto!: string;
}
