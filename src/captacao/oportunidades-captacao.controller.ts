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
import { CAPTACAO_ROLES } from './captacao.roles';
import { CaptacaoService } from './captacao.service';
import {
  CreateOportunidadeCaptacaoDto,
  PerderOportunidadeDto,
  UpdateOportunidadeCaptacaoDto,
} from './dto/oportunidade-captacao.dto';

@Controller('captacao/oportunidades')
@UseGuards(RolesGuard)
export class OportunidadesCaptacaoController {
  constructor(private readonly captacao: CaptacaoService) {}

  @Get()
  @Roles(...CAPTACAO_ROLES)
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.captacao.listOportunidades(user);
  }

  @Post()
  @Roles(...CAPTACAO_ROLES)
  create(
    @Body() dto: CreateOportunidadeCaptacaoDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.captacao.createOportunidade(dto, user);
  }

  @Patch(':id')
  @Roles(...CAPTACAO_ROLES)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOportunidadeCaptacaoDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.captacao.updateOportunidade(id, dto, user);
  }

  @Post(':id/perder')
  @Roles(...CAPTACAO_ROLES)
  perder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PerderOportunidadeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.captacao.perderOportunidade(id, dto, user);
  }

  @Post(':id/promover')
  @Roles(...CAPTACAO_ROLES)
  promover(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.captacao.promoverOportunidade(id, user);
  }
}
