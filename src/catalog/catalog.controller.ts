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
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { CatalogService } from './catalog.service';
import { CreateCatalogItemDto } from './dto/create-catalog-item.dto';
import { UpdateCatalogItemDto } from './dto/update-catalog-item.dto';
import { QueryCatalogDto } from './dto/query-catalog.dto';
import { ReorderCatalogDto } from './dto/reorder-catalog.dto';

/**
 * Catálogos configuráveis (funil, origens, motivos de perda, tags, documentação).
 * Leitura: qualquer usuário autenticado.
 * Mutação geral: admin, gerente e super_admin (tenant da plataforma).
 * Analista: documentação, origens, motivos de perda, tags e CCAs (criar/editar/excluir).
 * Treinee: origens, tags e CCAs.
 * Corretor: somente leitura (motivos de perda vêm da gerência).
 */
@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get()
  find(
    @Query() query: QueryCatalogDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    const activeOnly = query.activeOnly ?? true;
    if (query.type) {
      return this.catalogService.findByType(requester, query.type, activeOnly);
    }
    return this.catalogService.findAllGrouped(requester, activeOnly);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.admin, Role.gerente, Role.analista, Role.treinee, Role.super_admin)
  create(
    @Body() dto: CreateCatalogItemDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.catalogService.create(dto, requester);
  }

  /** Instala/restaura o pacote padrão de etapas do funil no banco. */
  @Post('defaults/funil')
  @UseGuards(RolesGuard)
  @Roles(Role.admin, Role.gerente, Role.super_admin)
  installDefaultFunnel(@CurrentUser() requester: AuthenticatedUser) {
    return this.catalogService.installDefaultFunnelStages(requester);
  }

  @Patch('reorder')
  @UseGuards(RolesGuard)
  @Roles(Role.admin, Role.gerente, Role.super_admin)
  reorder(
    @Body() dto: ReorderCatalogDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.catalogService.reorder(dto, requester);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.admin, Role.gerente, Role.analista, Role.treinee, Role.super_admin)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCatalogItemDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.catalogService.update(id, dto, requester);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.admin, Role.gerente, Role.analista, Role.treinee, Role.super_admin)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.catalogService.remove(id, requester);
  }
}
