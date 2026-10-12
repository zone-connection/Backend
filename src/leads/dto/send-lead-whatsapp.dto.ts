import { IsString, MaxLength, MinLength } from 'class-validator';

export class SendLeadWhatsappDto {
  @IsString()
  @MinLength(1, { message: 'Informe a mensagem.' })
  @MaxLength(4000)
  content!: string;
}
