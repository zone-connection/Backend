import { Body, Controller, Get, Post, Query, Req, UseGuards, UseInterceptors } from '@nestjs/common';
import type { Request } from 'express';
import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { Public } from '../common/decorators/public.decorator';
import { ApiAccessGuard } from './api-access.guard';
import { ApiAuditInterceptor } from './api-audit.interceptor';
import { ApiScopes } from './api-context';
import { ApiOauthService } from './api-oauth.service';
import { ApiTenant } from './api-tenant.decorator';
import type { ApiRequestContext } from './api-context';

class TokenDto {
  @IsIn(['client_credentials'])
  grant_type!: 'client_credentials';

  @IsString()
  @MinLength(8)
  client_id!: string;

  @IsString()
  @MinLength(16)
  client_secret!: string;

  /** Slug do Tenant já autorizado. Não abre tenant fora da autorização. */
  @IsString()
  @MinLength(1)
  tenant_slug!: string;
}

class ContextoQuery {
  @IsOptional()
  @IsString()
  tenantId?: string;
}

@Public()
@UseInterceptors(ApiAuditInterceptor)
@Controller('v1')
export class ApiV1Controller {
  constructor(private readonly oauth: ApiOauthService) {}

  @Post('oauth/token')
  token(@Body() body: TokenDto, @Req() req: Request) {
    return this.oauth.issue(body, req.ip || 'desconhecido');
  }

  @Get('contexto')
  @UseGuards(ApiAccessGuard)
  @ApiScopes('leads:read')
  contexto(
    @ApiTenant() api: ApiRequestContext,
    @Query() _query: ContextoQuery,
  ) {
    return {
      tenantId: api.tenantId,
      appId: api.appId,
      scopes: api.scopes,
    };
  }
}
