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
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { LeadsService } from './leads.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { UpdateLeadStageDto } from './dto/update-lead-stage.dto';
import { QueryLeadsDto } from './dto/query-leads.dto';
import { MarkLeadLostDto } from './dto/mark-lead-lost.dto';
import { CheckImportLeadsDto, ImportLeadsDto } from './dto/import-leads.dto';
import { AdiarPrazoDto } from './dto/adiar-prazo.dto';
import {
  DistribuirCorretoresDto,
  DistribuirEquipesDto,
} from './dto/distribuir-leads.dto';

/**
 * Leads / clientes. Acessível a qualquer usuário autenticado; a visibilidade é
 * filtrada por perfil no service (corretor vê só os próprios; gerente/admin, todos).
 */
@Controller('leads')
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Post()
  create(
    @Body() dto: CreateLeadDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.leadsService.create(dto, requester);
  }

  @Post('import')
  importMany(
    @Body() dto: ImportLeadsDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.leadsService.importMany(dto, requester);
  }

  @Post('import/check')
  checkImport(
    @Body() dto: CheckImportLeadsDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.leadsService.checkImportDuplicates(dto, requester);
  }

  @Get('distribuir/resumo')
  @UseGuards(RolesGuard)
  @Roles(Role.admin, Role.gerente)
  distribuirResumo(@CurrentUser() requester: AuthenticatedUser) {
    return this.leadsService.distribuirResumo(requester);
  }

  @Post('distribuir/equipes')
  @UseGuards(RolesGuard)
  @Roles(Role.admin, Role.gerente)
  distribuirEquipes(
    @Body() dto: DistribuirEquipesDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.leadsService.distribuirEquipes(dto, requester);
  }

  @Post('distribuir/corretores')
  @UseGuards(RolesGuard)
  @Roles(Role.admin, Role.gerente)
  distribuirCorretores(
    @Body() dto: DistribuirCorretoresDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.leadsService.distribuirCorretores(dto, requester);
  }

  @Get()
  findAll(
    @Query() query: QueryLeadsDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.leadsService.findAll(query, requester);
  }

  /**
   * Corretores ativos para atribuição de lead / select.
   * Admin, gerente e analista: todos os corretores do tenant.
   * Corretor: só a si. Precisa ficar antes de GET :id.
   */
  @Get('assignees')
  listAssignees(@CurrentUser() requester: AuthenticatedUser) {
    return this.leadsService.listAssignees(requester);
  }

  /** Leads perdidos — só admin. Antes de GET :id. */
  @Get('perdidos')
  @UseGuards(RolesGuard)
  @Roles(Role.admin, Role.super_admin)
  findLost(
    @Query() query: QueryLeadsDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.leadsService.findLost(query, requester);
  }

  /** Clientes perdidos — corretor/treinee (própria carteira). Antes de GET :id. */
  @Get('clientes-perdidos')
  @UseGuards(RolesGuard)
  @Roles(Role.corretor, Role.treinee)
  findLostClientes(
    @Query() query: QueryLeadsDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.leadsService.findLostClientes(query, requester);
  }

  @Get('monitoramento/corretores')
  @UseGuards(RolesGuard)
  @Roles(Role.admin, Role.gerente, Role.analista, Role.super_admin)
  monitoramentoCorretores(@CurrentUser() requester: AuthenticatedUser) {
    return this.leadsService.listCorretoresMonitoramento(requester);
  }

  @Post('monitoramento/sync')
  @HttpCode(HttpStatus.OK)
  syncMonitoramento(@CurrentUser() requester: AuthenticatedUser) {
    return this.leadsService.syncMonitoramentoNotificacoes(requester);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.leadsService.findOne(id, requester);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLeadDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.leadsService.update(id, dto, requester);
  }

  @Patch(':id/stage')
  updateStage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLeadStageDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.leadsService.updateStage(id, dto, requester);
  }

  /** Soft-delete operacional: lead vai para Leads Perdidos. */
  @Post(':id/perder')
  markLost(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MarkLeadLostDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.leadsService.markLost(id, dto.motivo, requester);
  }

  @Post(':id/prazo/adiar')
  @UseGuards(RolesGuard)
  @Roles(Role.admin, Role.gerente)
  adiarPrazo(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdiarPrazoDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.leadsService.adiarPrazo(id, dto, requester);
  }

  @Get(':id/prazo/adiamentos')
  listPrazoAdiamentos(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.leadsService.listPrazoAdiamentos(id, requester);
  }

  /** Exclusão definitiva — só admin, e só de leads já perdidos. */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(RolesGuard)
  @Roles(Role.admin, Role.super_admin)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    await this.leadsService.remove(id, requester);
  }
}
