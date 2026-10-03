import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { DashboardService } from './dashboard.service';
import { QueryDashboardDto } from './dto/query-dashboard.dto';

@Controller('dashboard')
@UseGuards(RolesGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('corretor/:id/vendas')
  @Roles(
    Role.admin,
    Role.gerente,
    Role.analista,
    Role.corretor,
    Role.treinee,
    Role.financeiro,
    Role.super_admin,
  )
  listVendasCorretor(
    @Param('id', ParseUUIDPipe) corretorId: string,
    @CurrentUser() requester: AuthenticatedUser,
    @Query() query: QueryDashboardDto,
  ) {
    return this.dashboardService.listVendasCorretor(
      corretorId,
      requester,
      query,
    );
  }

  @Get('corretor/:id/esteira')
  @Roles(
    Role.admin,
    Role.gerente,
    Role.analista,
    Role.corretor,
    Role.treinee,
    Role.financeiro,
    Role.super_admin,
  )
  esteiraCorretor(
    @Param('id', ParseUUIDPipe) corretorId: string,
    @CurrentUser() requester: AuthenticatedUser,
    @Query() query: QueryDashboardDto,
  ) {
    return this.dashboardService.esteiraCorretor(
      corretorId,
      requester,
      query,
    );
  }

  @Get('corretor')
  @Roles(Role.corretor, Role.treinee)
  resumoCorretor(@CurrentUser() requester: AuthenticatedUser) {
    return this.dashboardService.resumoCorretor(requester);
  }

  @Get('admin')
  @Roles(
    Role.admin,
    Role.gerente,
    Role.analista,
    Role.corretor,
    Role.treinee,
    Role.financeiro,
    Role.super_admin,
  )
  resumoAdmin(
    @CurrentUser() requester: AuthenticatedUser,
    @Query() query: QueryDashboardDto,
  ) {
    return this.dashboardService.resumoAdmin(requester, query);
  }

  @Get('ranking')
  @Roles(
    Role.admin,
    Role.gerente,
    Role.analista,
    Role.corretor,
    Role.treinee,
    Role.financeiro,
    Role.super_admin,
  )
  ranking(
    @CurrentUser() requester: AuthenticatedUser,
    @Query() query: QueryDashboardDto,
  ) {
    return this.dashboardService.rankingCompleto(requester, query);
  }
}
