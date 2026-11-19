import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { ApiAccessGuard } from './api-access.guard';
import { ApiAuditInterceptor } from './api-audit.interceptor';
import { ApiScopes, type ApiRequestContext } from './api-context';
import { ApiPropertiesService } from './api-properties.service';
import { ApiTenant } from './api-tenant.decorator';
import { ListarPropertiesApiDto } from './dto/listar-properties-api.dto';

@Public()
@UseInterceptors(ApiAuditInterceptor)
@UseGuards(ApiAccessGuard)
@Controller('v1/properties')
export class ApiPropertiesController {
  constructor(private readonly properties: ApiPropertiesService) {}

  @Get()
  @ApiScopes('properties:read')
  listar(
    @ApiTenant() api: ApiRequestContext,
    @Query() query: ListarPropertiesApiDto,
  ) {
    return this.properties.listar(api.tenantId, query);
  }

  @Get(':id')
  @ApiScopes('properties:read')
  detalhe(
    @ApiTenant() api: ApiRequestContext,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.properties.detalhe(api.tenantId, id);
  }
}
