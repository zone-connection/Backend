import { IsString, MaxLength, MinLength } from "class-validator";

export class CreateLocalidadeDto {
  @IsString()
  @MinLength(2, { message: "O nome deve ter ao menos 2 caracteres." })
  @MaxLength(80)
  nome!: string;
}
