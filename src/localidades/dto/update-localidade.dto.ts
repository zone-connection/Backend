import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class UpdateLocalidadeDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: "O nome deve ter ao menos 2 caracteres." })
  @MaxLength(80)
  nome?: string;
}
