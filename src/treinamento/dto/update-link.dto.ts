import { IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';

export class UpdateTreinamentoLinkDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'O nome deve ter ao menos 2 caracteres.' })
  @MaxLength(120)
  titulo?: string;

  @IsOptional()
  @IsUrl(
    { require_protocol: true, protocols: ['https'] },
    { message: 'Informe uma URL https válida (ex.: pasta do Google Drive).' },
  )
  @MaxLength(500)
  url?: string;
}
