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
import { CreateComentarioDto } from './dto/create-comentario.dto';
import { CreateTarefaDto } from './dto/create-tarefa.dto';
import { UpdateTarefaDto } from './dto/update-tarefa.dto';
import { TarefasService } from './tarefas.service';

const ROLES = [
  Role.admin,
  Role.gerente,
  Role.corretor,
  Role.treinee,
  Role.analista,
  Role.assistente,
  Role.financeiro,
] as const;

@Controller('tarefas')
@UseGuards(RolesGuard)
@Roles(...ROLES)
export class TarefasController {
  constructor(private readonly tarefas: TarefasService) {}

  @Get('acesso')
  acesso(@CurrentUser() requester: AuthenticatedUser) {
    return this.tarefas.acesso(requester);
  }

  @Get()
  list(
    @CurrentUser() requester: AuthenticatedUser,
    @Query('filtro') filtro?: string,
    @Query('leadId') leadId?: string,
    @Query('agendamentoId') agendamentoId?: string,
    @Query('imovelId') imovelId?: string,
  ) {
    return this.tarefas.list(requester, {
      filtro,
      leadId,
      agendamentoId,
      imovelId,
    });
  }

  @Post()
  create(
    @Body() dto: CreateTarefaDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.tarefas.create(dto, requester);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTarefaDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.tarefas.update(id, dto, requester);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.tarefas.remove(id, requester);
  }

  @Post(':id/comentarios')
  comentar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateComentarioDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.tarefas.comentar(id, dto, requester);
  }
}
