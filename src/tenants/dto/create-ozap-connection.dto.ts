import { IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateOzapConnectionDto {
  @IsInt({ message: 'O instanceId deve ser um número inteiro.' })
  @Min(1, { message: 'O instanceId deve ser maior que zero.' })
  instanceId!: number;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  openaiApiKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(800)
  ozapApiKey?: string;
}
