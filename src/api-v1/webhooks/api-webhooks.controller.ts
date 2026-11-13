import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { IsArray, IsBoolean, IsOptional, IsString, IsUrl } from 'class-validator';
import { ApiAccessGuard } from '../api-access.guard';
import { ApiAuditInterceptor } from '../api-audit.interceptor';
import { ApiScopes, type ApiRequestContext } from '../api-context';
import { ApiTenant } from '../api-tenant.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { WebhookDestinosService } from './webhooks.service';

class CriarWebhookDto {
  @IsUrl({ require_protocol: true, protocols: ['https', 'http'] })
  url!: string;

  @IsArray()
  @IsString({ each: true })
  events!: string[];
}

class AtualizarWebhookDto {
  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['https', 'http'] })
  url?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  events?: string[];

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

@Controller('v1/webhooks')
@Public()
@UseGuards(ApiAccessGuard)
@UseInterceptors(ApiAuditInterceptor)
export class ApiWebhooksController {
  constructor(private readonly destinos: WebhookDestinosService) {}

  @Post()
  @ApiScopes('webhooks:manage')
  criar(@ApiTenant() api: ApiRequestContext, @Body() dto: CriarWebhookDto) {
    return this.destinos.criar(api.tenantId, api.appId, dto.url, dto.events);
  }

  @Get()
  @ApiScopes('webhooks:manage')
  listar(@ApiTenant() api: ApiRequestContext) {
    return this.destinos.listar(api.tenantId, api.appId);
  }

  @Get(':id')
  @ApiScopes('webhooks:manage')
  obter(
    @ApiTenant() api: ApiRequestContext,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.destinos.obter(api.tenantId, api.appId, id);
  }

  @Patch(':id')
  @ApiScopes('webhooks:manage')
  atualizar(
    @ApiTenant() api: ApiRequestContext,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: AtualizarWebhookDto,
  ) {
    return this.destinos.atualizar(api.tenantId, api.appId, id, dto);
  }

  @Delete(':id')
  @ApiScopes('webhooks:manage')
  desativar(
    @ApiTenant() api: ApiRequestContext,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.destinos.desativar(api.tenantId, api.appId, id);
  }

  @Post(':id/rotate-secret')
  @ApiScopes('webhooks:manage')
  rotacionar(
    @ApiTenant() api: ApiRequestContext,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.destinos.rotacionar(api.tenantId, api.appId, id);
  }
}
