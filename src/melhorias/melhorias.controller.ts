import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { CreateMelhoriaComentarioDto, CreateMelhoriaDto, UpdateMelhoriaDto } from './melhorias.dto';
import { MelhoriasService } from './melhorias.service';

@Controller('melhorias')
@UseGuards(RolesGuard)
@Roles(Role.super_admin)
export class MelhoriasController {
  constructor(private readonly service: MelhoriasService) {}

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
  create(@Body() dto: CreateMelhoriaDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.create(dto, user);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMelhoriaDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.update(id, dto, user);
  }

  @Post(':id/comentarios')
  addComentario(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateMelhoriaComentarioDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.addComentario(id, dto, user);
  }
}
