import { IsString, MaxLength, MinLength } from 'class-validator';

export class MoverLeadApiDto {
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  stage!: string;
}
