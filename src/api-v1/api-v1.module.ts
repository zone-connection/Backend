import { Module } from '@nestjs/common';
import { ApiAccessGuard } from './api-access.guard';
import { ApiAppsController } from './api-apps.controller';
import { ApiAppsService } from './api-apps.service';
import { ApiAuditInterceptor } from './api-audit.interceptor';
import { ApiOauthLimiteService } from './api-oauth-limite.service';
import { ApiOauthService } from './api-oauth.service';
import { ApiV1Controller } from './api-v1.controller';

@Module({
  controllers: [ApiV1Controller, ApiAppsController],
  providers: [
    ApiOauthService,
    ApiOauthLimiteService,
    ApiAppsService,
    ApiAccessGuard,
    ApiAuditInterceptor,
  ],
  exports: [ApiOauthService, ApiAccessGuard],
})
export class ApiV1Module {}
