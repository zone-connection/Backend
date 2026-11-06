import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { UpdateTenantOperationModulesDto } from './dto/update-tenant-operation-modules.dto';
import { TenantsService } from './tenants.service';

/**
 * Operações da imobiliária (Tenant.modules): comercial / captação / usados / locação.
 */
@Controller('tenant/modules')
@UseGuards(RolesGuard)
export class TenantModulesController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get()
  @Roles(Role.admin, Role.gerente)
  getModules(@CurrentUser() requester: AuthenticatedUser) {
    return this.tenantsService.getOperationModules(requester);
  }

  @Patch()
  @Roles(Role.admin)
  updateModules(
    @CurrentUser() requester: AuthenticatedUser,
    @Body() dto: UpdateTenantOperationModulesDto,
  ) {
    return this.tenantsService.updateOperationModules(requester, dto);
  }
}
