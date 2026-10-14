import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
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
  CreateCorrecaoPendenciaDto,
  CreatePendenciaProcessoDto,
  CreateProcessoDto,
  MoverEtapaProcessoDto,
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

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.processos.remove(id, user);
  }

  @Post(':id/enviar')
  enviar(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.processos.enviar(id, user);
  }

  @Post(':id/reenviar')
  reenviar(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.processos.reenviar(id, user);
  }

  @Patch(':id/etapa')
  @Roles(Role.admin, Role.gerente, Role.analista, Role.super_admin)
  moverEtapa(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MoverEtapaProcessoDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.processos.moverEtapa(id, dto, user);
  }

  @Post(':id/pendencias')
  @Roles(Role.admin, Role.gerente, Role.analista, Role.super_admin)
  criarPendencia(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreatePendenciaProcessoDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.processos.criarPendencia(id, dto, user);
  }

  @Post(':id/pendencias/:pendenciaId/correcoes')
  criarCorrecao(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('pendenciaId', ParseUUIDPipe) pendenciaId: string,
    @Body() dto: CreateCorrecaoPendenciaDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.processos.criarCorrecao(id, pendenciaId, dto, user);
  }

  @Post(':id/retorno')
  @Roles(Role.admin, Role.gerente, Role.analista, Role.super_admin)
  retornar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RetornoProcessoDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.processos.retornar(id, dto, user);
  }
}
