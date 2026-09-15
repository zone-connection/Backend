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
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { CreateAgendamentoDto } from './dto/create-agendamento.dto';
import { UpdateAgendamentoDto } from './dto/update-agendamento.dto';
import { QueryAgendamentoDto } from './dto/query-agendamento.dto';
import { RecusarAgendamentoDto } from './dto/recusar-agendamento.dto';
import { AgendaService } from './agenda.service';

@Controller('agenda')
@UseGuards(RolesGuard)
@Roles(Role.admin, Role.gerente, Role.corretor, Role.treinee, Role.super_admin)
export class AgendaController {
  constructor(private readonly agendaService: AgendaService) {}

  @Get()
  list(
    @Query() query: QueryAgendamentoDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.agendaService.list(query, requester);
  }

  @Get('solicitacoes/count')
  countSolicitacoes(@CurrentUser() requester: AuthenticatedUser) {
    return this.agendaService.countSolicitacoes(requester);
  }

  @Get('solicitacoes')
  listSolicitacoes(@CurrentUser() requester: AuthenticatedUser) {
    return this.agendaService.listSolicitacoes(requester);
  }

  @Get('lembretes')
  @Roles(Role.admin, Role.gerente, Role.corretor, Role.treinee, Role.analista, Role.super_admin)
  syncLembretes(@CurrentUser() requester: AuthenticatedUser) {
    return this.agendaService.syncLembretes(requester);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.agendaService.findOne(id, requester);
  }

  @Post()
  create(
    @Body() dto: CreateAgendamentoDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.agendaService.create(dto, requester);
  }

  @Post(':id/aprovar')
  aprovar(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.agendaService.aprovar(id, requester);
  }

  @Post(':id/recusar')
  recusar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecusarAgendamentoDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.agendaService.recusar(id, dto.motivo, requester);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAgendamentoDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.agendaService.update(id, dto, requester);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('series') series: string | undefined,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    const seriesMode = series === 'all' ? 'all' : 'one';
    return this.agendaService.remove(id, requester, seriesMode);
  }
}
