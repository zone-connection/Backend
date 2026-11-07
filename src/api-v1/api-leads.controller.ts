import { Body, Controller, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { ApiAccessGuard } from './api-access.guard';
import { ApiAuditInterceptor } from './api-audit.interceptor';
import { ApiScopes, type ApiRequestContext } from './api-context';
import { ApiLeadsService } from './api-leads.service';
import { ApiTenant } from './api-tenant.decorator';
import { CriarLeadApiDto } from './dto/criar-lead-api.dto';

@Public()
@UseInterceptors(ApiAuditInterceptor)
@UseGuards(ApiAccessGuard)
@Controller('v1/leads')
export class ApiLeadsController {
  constructor(private readonly leads: ApiLeadsService) {}

  @Post()
  @ApiScopes('leads:write')
  criar(@ApiTenant() api: ApiRequestContext, @Body() body: CriarLeadApiDto) {
    return this.leads.criar(api.tenantId, body);
  }
}
