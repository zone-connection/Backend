import {
  Body,
  Controller,
  Get,
  Param,
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
import {
  ConfirmarDevolucaoMuralChaveDto,
  CreateMuralChaveDto,
  DevolverMuralChaveDto,
  QueryMuralChavesDto,
  RetiradaManualMuralChaveDto,
  RetirarMuralChaveDto,
  UpdateMuralChaveDto,
} from './dto/mural-chave.dto';
import { MuralChavesService } from './mural-chaves.service';

const ALL: Role[] = [
  Role.admin,
  Role.gerente,
  Role.corretor,
  Role.treinee,
  Role.assistente,
  Role.analista,
  Role.financeiro,
  Role.super_admin,
];

const GESTORES: Role[] = [Role.admin, Role.gerente, Role.super_admin];

@Controller('mural-chaves')
@UseGuards(RolesGuard)
export class MuralChavesController {
  constructor(private readonly mural: MuralChavesService) {}

  @Get('opcoes')
  @Roles(...ALL)
  opcoes(@CurrentUser() user: AuthenticatedUser) {
    return this.mural.opcoes(user);
  }

  @Get('pendencias')
  @Roles(...ALL)
  pendencias(@CurrentUser() user: AuthenticatedUser) {
    return this.mural.pendencias(user);
  }

  @Get()
  @Roles(...ALL)
  list(@Query() query: QueryMuralChavesDto, @CurrentUser() user: AuthenticatedUser) {
    return this.mural.list(query, user);
  }

  @Get(':id/historico')
  @Roles(...ALL)
  historico(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.mural.historico(id, user);
  }

  @Post()
  @Roles(...GESTORES)
  create(@Body() dto: CreateMuralChaveDto, @CurrentUser() user: AuthenticatedUser) {
    return this.mural.create(dto, user);
  }

  @Patch(':id')
  @Roles(...GESTORES)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateMuralChaveDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.mural.update(id, dto, user);
  }

  @Post(':id/retirada')
  @Roles(...ALL)
  retirar(
    @Param('id') id: string,
    @Body() dto: RetirarMuralChaveDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.mural.retirar(id, dto, user);
  }

  @Post(':id/retirada-manual')
  @Roles(...GESTORES)
  retiradaManual(
    @Param('id') id: string,
    @Body() dto: RetiradaManualMuralChaveDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.mural.retiradaManual(id, dto, user);
  }

  @Post(':id/devolucao')
  @Roles(...GESTORES)
  devolver(
    @Param('id') id: string,
    @Body() dto: DevolverMuralChaveDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.mural.devolver(id, dto, user);
  }

  @Post('movimentos/:movimentoId/confirmar')
  @Roles(...ALL)
  confirmar(
    @Param('movimentoId') movimentoId: string,
    @Body() dto: ConfirmarDevolucaoMuralChaveDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.mural.confirmar(movimentoId, dto, user);
  }
}
