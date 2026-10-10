import { IsString, Length, MaxLength, MinLength } from 'class-validator';

export class TotpTicketDto {
  @IsString()
  @MinLength(20)
  @MaxLength(2000)
  ticket!: string;
}

export class TotpVerifyDto {
  @IsString()
  @MinLength(20)
  @MaxLength(2000)
  ticket!: string;

  @IsString()
  @Length(6, 16)
  code!: string;
}

export class TotpCodeDto {
  @IsString()
  @Length(6, 16)
  code!: string;
}
