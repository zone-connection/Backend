import { Type } from 'class-transformer';
import {
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateOnboardingDto {
  @IsUUID('4')
  tenantId!: string;

  @IsDateString()
  inicio!: string;

  @IsDateString()
  prazoPrevisto!: string;

  @IsOptional()
  @IsUUID('4')
  responsavelId?: string;

  @IsOptional()
  @IsUUID('4')
  platformContratoId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  observacao?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  justificativa?: string;
}

export class UpdateOnboardingDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsUUID('4')
  responsavelId?: string | null;

  @IsOptional()
  @IsDateString()
  prazoPrevisto?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  observacao?: string;
}

export class UpdateOnboardingEtapaDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @Type(() => Boolean)
  obrigatoria?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  pendencia?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observacao?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  titulo?: string;
}
