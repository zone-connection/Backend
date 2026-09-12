import { Role, UserStatus } from '@prisma/client';
import { Type, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class QueryUsersDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(Role, { message: 'Perfil inválido.' })
  role?: Role;

  @IsOptional()
  @IsEnum(UserStatus, { message: 'Status inválido.' })
  status?: UserStatus;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  comCreci?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number = 20;

  @IsOptional()
  @IsIn(['created_desc', 'created_asc', 'nome_asc', 'nome_desc'], {
    message:
      'Ordenação inválida. Use created_desc, created_asc, nome_asc ou nome_desc.',
  })
  sort?: 'created_desc' | 'created_asc' | 'nome_asc' | 'nome_desc';
}
