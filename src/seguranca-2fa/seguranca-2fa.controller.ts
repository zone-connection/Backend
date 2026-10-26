import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role, TwoFactorStatus } from '@prisma/client';
import { IsBoolean, IsString, Length } from 'class-validator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { Seguranca2faService } from './seguranca-2fa.service';

class CodeDto {
  @IsString()
  @Length(6, 8)
  code!: string;
}

class AceiteDto {
  @IsBoolean()
  aceito!: boolean;
}

@Controller('seguranca/2fa')
@UseGuards(RolesGuard)
export class Seguranca2faController {
  constructor(private readonly service: Seguranca2faService) {}

  @Get('eu')
  @Roles(Role.admin)
  eu(@CurrentUser() user: AuthenticatedUser) {
    return this.service.estado(user.id);
  }

  @Get('termos')
  @Roles(Role.admin, Role.super_admin)
  termos() {
    return this.service.terms();
  }

  @Post('preparar')
  @Roles(Role.admin)
  preparar(@CurrentUser() user: AuthenticatedUser) {
    return this.service.preparar(user.id);
  }

  @Post('confirmar')
  @Roles(Role.admin)
  confirmar(@CurrentUser() user: AuthenticatedUser, @Body() dto: CodeDto) {
    return this.service.confirmar(user.id, dto.code);
  }

  @Post('aceitar-risco')
  @Roles(Role.admin)
  aceitar(@CurrentUser() user: AuthenticatedUser, @Body() dto: AceiteDto) {
    return this.service.aceitarRisco(user.id, dto.aceito);
  }

  @Get('painel')
  @Roles(Role.super_admin)
  painel(
    @Query('estado') estado?: TwoFactorStatus,
    @Query('tenantId') tenantId?: string,
    @Query('role') role?: Role,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const estados = Object.values(TwoFactorStatus);
    const roles = Object.values(Role);
    return this.service.painel({
      estado: estado && estados.includes(estado) ? estado : undefined,
      tenantId,
      role: role && roles.includes(role) ? role : undefined,
      from,
      to,
    });
  }

  @Get('usuarios/:id/historico')
  @Roles(Role.super_admin)
  historico(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.historico(id);
  }

  @Get('avisos')
  @Roles(Role.super_admin)
  avisos(@CurrentUser() user: AuthenticatedUser) {
    return this.service.avisos(user.id);
  }

  @Patch('avisos/:id/lida')
  @Roles(Role.super_admin)
  lida(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.marcarAviso(user.id, id);
  }
}
