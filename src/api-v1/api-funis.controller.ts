import { Controller, Get, Param, ParseUUIDPipe, UseGuards, UseInterceptors } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { ApiAccessGuard } from './api-access.guard';
import { ApiAuditInterceptor } from './api-audit.interceptor';
import { ApiScopes } from './api-context';
import { ApiFunisService } from './api-funis.service';
import { ApiTenant } from './api-tenant.decorator';
import type { ApiRequestContext } from './api-context';

@Public()
@UseInterceptors(ApiAuditInterceptor)
@UseGuards(ApiAccessGuard)
@ApiScopes('funnels:read')
@Controller('v1/funnels')
export class ApiFunisController {
  constructor(private readonly funis: ApiFunisService) {}

  @Get()
  listar(@ApiTenant() api: ApiRequestContext) {
    return this.funis.listar(api.tenantId);
  }

  @Get(':id/stages')
  etapas(
    @ApiTenant() api: ApiRequestContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.funis.etapas(api.tenantId, id);
  }

  @Get(':id')
  detalhe(
    @ApiTenant() api: ApiRequestContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.funis.detalhe(api.tenantId, id);
  }
}
