import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { AtendimentoService } from './atendimento.service';

const leitura = [
  Role.admin,
  Role.super_admin,
  Role.gerente,
  Role.financeiro,
  Role.corretor,
  Role.treinee,
  Role.analista,
  Role.assistente,
] as const;

@Controller('atendimento')
@UseGuards(RolesGuard)
export class AtendimentoController {
  constructor(private readonly atendimento: AtendimentoService) {}

  @Get('config')
  @Roles(...leitura)
  config(@CurrentUser() user: AuthenticatedUser) {
    return this.atendimento.config(user);
  }

  @Patch('config')
  @Roles(Role.admin, Role.super_admin)
  flags(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { cadenciaAtiva?: boolean; checklistAtivo?: boolean },
  ) {
    return this.atendimento.atualizarFlags(user, body);
  }

  @Post('cadencia/etapas')
  @Roles(Role.admin, Role.super_admin)
  criarEtapa(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { dia: number; acao: string; descricao?: string },
  ) {
    return this.atendimento.criarEtapa(user, body);
  }

  @Patch('cadencia/etapas/ordem')
  @Roles(Role.admin, Role.super_admin)
  ordenarEtapas(@CurrentUser() user: AuthenticatedUser, @Body() body: { ids: string[] }) {
    return this.atendimento.ordenarEtapas(user, body.ids ?? []);
  }

  @Patch('cadencia/etapas/:id')
  @Roles(Role.admin, Role.super_admin)
  editarEtapa(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { dia?: number; acao?: string; descricao?: string },
  ) {
    return this.atendimento.editarEtapa(user, id, body);
  }

  @Delete('cadencia/etapas/:id')
  @Roles(Role.admin, Role.super_admin)
  excluirEtapa(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.atendimento.excluirEtapa(user, id);
  }

  @Post('checklist/modelos')
  @Roles(Role.admin, Role.super_admin)
  criarModelo(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { nome: string; funilId?: string | null },
  ) {
    return this.atendimento.criarModelo(user, body);
  }

  @Patch('checklist/modelos/:id')
  @Roles(Role.admin, Role.super_admin)
  editarModelo(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { nome?: string; funilId?: string | null },
  ) {
    return this.atendimento.editarModelo(user, id, body);
  }

  @Delete('checklist/modelos/:id')
  @Roles(Role.admin, Role.super_admin)
  excluirModelo(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.atendimento.excluirModelo(user, id);
  }

  @Post('checklist/modelos/:id/itens')
  @Roles(Role.admin, Role.super_admin)
  criarItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { texto: string; obrigatorio?: boolean },
  ) {
    return this.atendimento.criarItem(user, id, body);
  }

  @Patch('checklist/itens/ordem')
  @Roles(Role.admin, Role.super_admin)
  ordenarItens(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { modeloId: string; ids: string[] },
  ) {
    return this.atendimento.ordenarItens(user, body.modeloId, body.ids ?? []);
  }

  @Patch('checklist/itens/:id')
  @Roles(Role.admin, Role.super_admin)
  editarItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { texto?: string; obrigatorio?: boolean },
  ) {
    return this.atendimento.editarItem(user, id, body);
  }

  @Delete('checklist/itens/:id')
  @Roles(Role.admin, Role.super_admin)
  excluirItem(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.atendimento.excluirItem(user, id);
  }

  @Get('sla')
  @Roles(...leitura)
  sla(@CurrentUser() user: AuthenticatedUser) {
    return this.atendimento.sla(user);
  }

  @Get('checklist/completos')
  @Roles(...leitura)
  completos(@CurrentUser() user: AuthenticatedUser) {
    return this.atendimento.completos(user);
  }

  @Get('leads/:id')
  @Roles(...leitura)
  painel(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.atendimento.painel(user, id);
  }

  @Post('leads/:id/cadencia/:etapaId')
  @Roles(...leitura)
  concluir(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('etapaId', ParseUUIDPipe) etapaId: string,
  ) {
    return this.atendimento.concluirCadencia(user, id, etapaId);
  }

  @Delete('leads/:id/cadencia/:etapaId')
  @Roles(...leitura)
  desfazer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('etapaId', ParseUUIDPipe) etapaId: string,
  ) {
    return this.atendimento.desfazerCadencia(user, id, etapaId);
  }

  @Post('leads/:id/checklist/:itemId')
  @Roles(...leitura)
  marcar(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() body: { feito: boolean },
  ) {
    return this.atendimento.marcarChecklist(user, id, itemId, Boolean(body.feito));
  }
}
