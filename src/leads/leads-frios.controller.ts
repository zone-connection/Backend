import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { EnviarLeadsFriosDto, ImportLeadsFriosDto, LeadFrioIdsDto, QueryLeadsFriosDto } from './dto/leads-frios.dto';
import { LeadsFriosService } from './leads-frios.service';

@Controller('leads-frios')
@UseGuards(RolesGuard)
@Roles(
  Role.super_admin,
  Role.admin,
  Role.gerente,
  Role.corretor,
  Role.treinee,
)
export class LeadsFriosController {
  constructor(private readonly frios: LeadsFriosService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: QueryLeadsFriosDto) {
    return this.frios.list(user, query);
  }

  @Post('importar')
  importar(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ImportLeadsFriosDto,
  ) {
    return this.frios.importRows(dto, user);
  }

  @Post('puxar')
  puxar(@CurrentUser() user: AuthenticatedUser, @Body() dto: LeadFrioIdsDto) {
    return this.frios.puxar(dto, user);
  }

  @Post('enviar')
  enviar(@CurrentUser() user: AuthenticatedUser, @Body() dto: EnviarLeadsFriosDto) {
    return this.frios.enviar(dto, user);
  }

  @Post(':id/devolver')
  devolver(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.frios.devolver(id, user);
  }

  @Post('apagar')
  apagar(@CurrentUser() user: AuthenticatedUser, @Body() dto: LeadFrioIdsDto) {
    return this.frios.apagar(dto, user);
  }
}
