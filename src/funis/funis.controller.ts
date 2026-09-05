import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role, FunilTipo } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { FunisService } from './funis.service';
import {
  CreateFunilDto,
  CreateFunilEtapaDto,
  QueryFunisDto,
  ReorderFunilEtapasDto,
  UpdateFunilDto,
  UpdateFunilEtapaDto,
} from './dto/funil.dto';

@Controller('funis')
@UseGuards(RolesGuard)
export class FunisController {
  constructor(private readonly funisService: FunisService) {}

  @Get()
  @Roles(Role.admin, Role.gerente, Role.corretor, Role.treinee, Role.analista, Role.super_admin)
  list(
    @CurrentUser() requester: AuthenticatedUser,
    @Query() query: QueryFunisDto,
  ) {
    return this.funisService.list(requester, query);
  }

  @Get('ativo')
  @Roles(Role.admin, Role.gerente, Role.corretor, Role.treinee, Role.analista, Role.super_admin)
  getAtivo(
    @CurrentUser() requester: AuthenticatedUser,
    @Query() query: QueryFunisDto,
  ) {
    return this.funisService.getAtivo(
      requester,
      query.tipo ?? FunilTipo.comercial,
    );
  }

  @Get(':id')
  @Roles(Role.admin, Role.gerente, Role.corretor, Role.treinee, Role.analista, Role.super_admin)
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.funisService.findOne(id, requester);
  }

  @Post()
  @Roles(Role.admin, Role.gerente, Role.super_admin)
  create(
    @Body() dto: CreateFunilDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.funisService.create(dto, requester);
  }

  @Patch(':id')
  @Roles(Role.admin, Role.gerente, Role.super_admin)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFunilDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.funisService.update(id, dto, requester);
  }

  @Post(':id/ativar')
  @Roles(Role.admin, Role.gerente, Role.super_admin)
  ativar(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.funisService.ativar(id, requester);
  }

  @Delete(':id')
  @Roles(Role.admin, Role.gerente, Role.super_admin)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.funisService.remove(id, requester);
  }

  @Post(':id/etapas')
  @Roles(Role.admin, Role.gerente, Role.super_admin)
  addEtapa(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateFunilEtapaDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.funisService.addEtapa(id, dto, requester);
  }

  @Patch(':id/etapas/reorder')
  @Roles(Role.admin, Role.gerente, Role.super_admin)
  reorderEtapas(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReorderFunilEtapasDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.funisService.reorderEtapas(id, dto, requester);
  }

  @Patch(':funilId/etapas/:etapaId')
  @Roles(Role.admin, Role.gerente, Role.super_admin)
  updateEtapa(
    @Param('funilId', ParseUUIDPipe) funilId: string,
    @Param('etapaId', ParseUUIDPipe) etapaId: string,
    @Body() dto: UpdateFunilEtapaDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.funisService.updateEtapa(funilId, etapaId, dto, requester);
  }

  @Delete(':funilId/etapas/:etapaId')
  @Roles(Role.admin, Role.gerente, Role.super_admin)
  removeEtapa(
    @Param('funilId', ParseUUIDPipe) funilId: string,
    @Param('etapaId', ParseUUIDPipe) etapaId: string,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.funisService.removeEtapa(funilId, etapaId, requester);
  }

  @Post(':id/etapas-padrao')
  @Roles(Role.admin, Role.gerente, Role.super_admin)
  installDefaults(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.funisService.installDefaults(id, requester);
  }

  @Post(':id/recuperar-etapas')
  @Roles(Role.admin, Role.gerente, Role.super_admin)
  recoverOrphanStages(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.funisService.recoverOrphanStages(id, requester);
  }
}
