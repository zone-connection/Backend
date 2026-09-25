import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import {
  CreatePresencaTipoDto,
  UpdatePresencaTipoDto,
  UpsertPresencaLancamentoDto,
} from './dto/presenca.dto';
import { PresencaService } from './presenca.service';

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

@Controller('presenca')
@UseGuards(RolesGuard)
export class PresencaController {
  constructor(private readonly presenca: PresencaService) {}

  @Get('tipos')
  @Roles(...ALL)
  listTipos(@CurrentUser() user: AuthenticatedUser) {
    return this.presenca.listTipos(user);
  }

  @Post('tipos')
  @Roles(Role.admin, Role.super_admin)
  createTipo(
    @Body() dto: CreatePresencaTipoDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.presenca.createTipo(dto, user);
  }

  @Patch('tipos/:id')
  @Roles(Role.admin, Role.super_admin)
  updateTipo(
    @Param('id') id: string,
    @Body() dto: UpdatePresencaTipoDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.presenca.updateTipo(id, dto, user);
  }

  @Delete('tipos/:id')
  @Roles(Role.admin, Role.super_admin)
  removeTipo(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.presenca.removeTipo(id, user);
  }

  @Get()
  @Roles(...ALL)
  mes(
    @Query('ano') ano: string,
    @Query('mes') mes: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const now = new Date();
    return this.presenca.mes(
      Number(ano) || now.getFullYear(),
      Number(mes) || now.getMonth() + 1,
      user,
    );
  }

  @Put('lancamento')
  @Roles(Role.admin, Role.gerente, Role.super_admin)
  upsert(
    @Body() dto: UpsertPresencaLancamentoDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.presenca.upsertLancamento(dto, user);
  }
}
