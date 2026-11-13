import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CompleteMetaOAuthDto {
  @IsString()
  @MinLength(1, { message: 'Selecione uma Página.' })
  @MaxLength(120)
  pageId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  adAccountId?: string;
}
