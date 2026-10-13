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
import { ProcessoStatus, Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import {
  CreateProcessoDto,
  RetornoProcessoDto,
  UpdateProcessoDto,
} from './dto/create-processo.dto';
import { ProcessosService } from './processos.service';

@Controller('processos')
@UseGuards(RolesGuard)
@Roles(
  Role.admin,
  Role.gerente,
  Role.corretor,
  Role.treinee,
  Role.analista,
  Role.super_admin,
)
export class ProcessosController {
  constructor(private readonly processos: ProcessosService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: ProcessoStatus,
  ) {
    return this.processos.list(user, status);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.processos.findOne(id, user);
  }

  @Post()
  create(
    @Body() dto: CreateProcessoDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.processos.create(dto, user);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProcessoDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.processos.update(id, dto, user);
  }

  @Post(':id/enviar')
  enviar(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.processos.enviar(id, user);
  }

  @Post(':id/retorno')
  @Roles(Role.admin, Role.gerente, Role.super_admin)
  retornar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RetornoProcessoDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.processos.retornar(id, dto, user);
  }
}
