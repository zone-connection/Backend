import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { CreateSuporteChamadoDto, CreateSuporteMensagemDto, UpdateSuporteChamadoDto } from './suporte.dto';
import { SuporteService } from './suporte.service';

@Controller('suporte')
@UseGuards(RolesGuard)
@Roles(Role.super_admin)
export class SuporteController {
  constructor(private readonly service: SuporteService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('q') q?: string,
    @Query('tenantId') tenantId?: string,
    @Query('status') status?: string,
    @Query('prioridade') prioridade?: string,
    @Query('categoria') categoria?: string,
    @Query('responsavelId') responsavelId?: string,
  ) {
    return this.service.list(user, { q, tenantId, status, prioridade, categoria, responsavelId });
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.findOne(id, user);
  }

  @Post()
  create(@Body() dto: CreateSuporteChamadoDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.create(dto, user);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSuporteChamadoDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.update(id, dto, user);
  }

  @Post(':id/mensagens')
  addMensagem(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateSuporteMensagemDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.addMensagem(id, dto, user);
  }
}
