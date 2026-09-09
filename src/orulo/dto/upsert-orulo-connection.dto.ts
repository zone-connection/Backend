import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class UpsertOruloConnectionDto {
  @IsString()
  @MinLength(8)
  clientId!: string;

  @IsString()
  @MinLength(8)
  clientSecret!: string;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
