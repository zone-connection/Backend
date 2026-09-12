import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { CaptacaoService } from './captacao.service';
import { CAPTACAO_ROLES } from './captacao.roles';
import { requireTenantId } from '../common/utils/tenant';
import {
  CreateProprietarioDto,
  QueryProprietariosDto,
  UpdateProprietarioDto,
} from './dto/proprietario.dto';
import { PortalProprietarioAuthService } from '../portal-proprietario/portal-proprietario-auth.service';
import { UpdateProprietarioPortalDto } from '../portal-proprietario/dto/portal-auth.dto';

@Controller('captacao/proprietarios')
@UseGuards(RolesGuard)
export class ProprietariosController {
  constructor(
    private readonly captacao: CaptacaoService,
    private readonly portalAuth: PortalProprietarioAuthService,
  ) {}

  @Get()
  @Roles(...CAPTACAO_ROLES)
  list(
    @Query() query: QueryProprietariosDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.captacao.listProprietarios(query, user);
  }

  @Get(':id')
  @Roles(...CAPTACAO_ROLES)
  get(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.captacao.getProprietario(id, user);
  }

  @Post()
  @Roles(...CAPTACAO_ROLES)
  create(
    @Body() dto: CreateProprietarioDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.captacao.createProprietario(dto, user);
  }

  @Patch(':id/portal')
  @Roles(...CAPTACAO_ROLES)
  async setPortal(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProprietarioPortalDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.captacao.getProprietario(id, user);
    return this.portalAuth.setAcesso(id, requireTenantId(user), dto);
  }

  @Patch(':id')
  @Roles(...CAPTACAO_ROLES)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProprietarioDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.captacao.updateProprietario(id, dto, user);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles(...CAPTACAO_ROLES)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.captacao.deleteProprietario(id, user);
  }
}
