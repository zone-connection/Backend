import {
  Body,
  Controller,
  ForbiddenException,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { ApiAppsService } from './api-apps.service';

class CriarAplicacaoDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  nome!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  descricao?: string;

  @IsUUID()
  tenantId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  scopes!: string[];
}

class ConcederDto {
  @IsUUID()
  tenantId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  scopes!: string[];
}

@Controller('v1/aplicacoes')
@UseGuards(RolesGuard)
@Roles(Role.super_admin)
export class ApiAppsController {
  constructor(private readonly apps: ApiAppsService) {}

  @Post()
  criar(
    @Body() body: CriarAplicacaoDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.onlySuperAdmin(user);
    return this.apps.criar(body);
  }

  @Post(':id/rotacionar')
  rotacionar(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.onlySuperAdmin(user);
    return this.apps.rotacionar(id);
  }

  @Post(':id/revogar')
  revogar(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.onlySuperAdmin(user);
    return this.apps.revogarAplicacao(id);
  }

  @Post(':id/autorizacoes')
  conceder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ConcederDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.onlySuperAdmin(user);
    return this.apps.conceder({ aplicacaoId: id, ...body });
  }

  @Post('autorizacoes/:autorizacaoId/revogar')
  revogarAutorizacao(
    @Param('autorizacaoId', ParseUUIDPipe) autorizacaoId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.onlySuperAdmin(user);
    return this.apps.revogarAutorizacao(autorizacaoId);
  }

  private onlySuperAdmin(user: AuthenticatedUser) {
    if (user.role !== Role.super_admin) {
      throw new ForbiddenException('Apenas o super administrador gerencia aplicações.');
    }
  }
}
