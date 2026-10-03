import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { ImoveisUsadosService } from './imoveis-usados.service';
import { IMOVEIS_USADOS_ROLES } from './imoveis-usados.roles';
import {
  CreateInteressadoUsadoDto,
  UpdateInteressadoUsadoDto,
} from './dto/imoveis-usados.dto';

@Controller('imoveis-usados/interessados')
@UseGuards(RolesGuard)
export class InteressadosUsadosController {
  constructor(private readonly service: ImoveisUsadosService) {}

  @Get()
  @Roles(...IMOVEIS_USADOS_ROLES)
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listInteressados(user);
  }

  @Get(':id')
  @Roles(...IMOVEIS_USADOS_ROLES)
  get(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.getInteressado(id, user);
  }

  @Post()
  @Roles(...IMOVEIS_USADOS_ROLES)
  create(
    @Body() dto: CreateInteressadoUsadoDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.createInteressado(dto, user);
  }

  @Patch(':id')
  @Roles(...IMOVEIS_USADOS_ROLES)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateInteressadoUsadoDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.updateInteressado(id, dto, user);
  }
}
