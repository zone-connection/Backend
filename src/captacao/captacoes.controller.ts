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
import {
  CreateCaptacaoDto,
  QueryCaptacoesDto,
  UpdateCaptacaoDto,
} from './dto/captacao.dto';

@Controller('captacao')
@UseGuards(RolesGuard)
export class CaptacoesController {
  constructor(private readonly captacao: CaptacaoService) {}

  @Get('resumo')
  @Roles(...CAPTACAO_ROLES)
  resumo(@CurrentUser() user: AuthenticatedUser) {
    return this.captacao.resumo(user);
  }

  @Get('responsaveis')
  @Roles(...CAPTACAO_ROLES)
  responsaveis(@CurrentUser() user: AuthenticatedUser) {
    return this.captacao.listResponsaveis(user);
  }

  @Get()
  @Roles(...CAPTACAO_ROLES)
  list(
    @Query() query: QueryCaptacoesDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.captacao.listCaptacoes(query, user);
  }

  @Get(':id')
  @Roles(...CAPTACAO_ROLES)
  get(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.captacao.getCaptacao(id, user);
  }

  @Post()
  @Roles(...CAPTACAO_ROLES)
  create(
    @Body() dto: CreateCaptacaoDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.captacao.createCaptacao(dto, user);
  }

  @Patch(':id')
  @Roles(...CAPTACAO_ROLES)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCaptacaoDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.captacao.updateCaptacao(id, dto, user);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles(...CAPTACAO_ROLES)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.captacao.deleteCaptacao(id, user);
  }
}
