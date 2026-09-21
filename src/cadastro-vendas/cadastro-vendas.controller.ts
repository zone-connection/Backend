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
import {
  CreateCadastroVendaDto,
  UpdateCadastroVendaDto,
} from './dto/cadastro-venda.dto';
import { CadastroVendasService } from './cadastro-vendas.service';

const ROLES = [
  Role.admin,
  Role.gerente,
  Role.corretor,
  Role.treinee,
] as const;

@Controller('cadastro-vendas')
@UseGuards(RolesGuard)
@Roles(...ROLES)
export class CadastroVendasController {
  constructor(private readonly service: CadastroVendasService) {}

  @Get()
  list(@CurrentUser() requester: AuthenticatedUser) {
    return this.service.list(requester);
  }

  @Post()
  create(
    @Body() dto: CreateCadastroVendaDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.service.create(dto, requester);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCadastroVendaDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.service.update(id, dto, requester);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.service.remove(id, requester);
  }
}
