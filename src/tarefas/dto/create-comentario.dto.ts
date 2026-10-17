import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateComentarioDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  texto!: string;
}
