import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateOzapConnectionDto {
  @IsOptional()
  @IsBoolean()
  ativo?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  openaiApiKey?: string;
}
