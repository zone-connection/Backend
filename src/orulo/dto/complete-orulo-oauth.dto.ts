import { IsString, MinLength } from 'class-validator';

export class CompleteOruloOAuthDto {
  @IsString()
  @MinLength(4)
  code!: string;
}
