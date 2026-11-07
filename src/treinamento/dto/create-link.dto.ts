import {
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateTreinamentoLinkDto {
  @IsUUID('4', { message: 'Seção inválida.' })
  secaoId!: string;

  @IsString()
  @MinLength(2, { message: 'O nome deve ter ao menos 2 caracteres.' })
  @MaxLength(120)
  titulo!: string;

  @IsUrl(
    { require_protocol: true, protocols: ['https'] },
    { message: 'Informe uma URL https válida (ex.: pasta do Google Drive).' },
  )
  @MaxLength(500)
  url!: string;
}
