import { Module } from '@nestjs/common';
import { LeadsModule } from '../leads/leads.module';
import { ApiAccessGuard } from './api-access.guard';
import { ApiAppsController } from './api-apps.controller';
import { ApiAppsService } from './api-apps.service';
import { ApiAuditInterceptor } from './api-audit.interceptor';
import { ApiLeadsController } from './api-leads.controller';
import { ApiLeadsService } from './api-leads.service';
import { ApiOauthLimiteService } from './api-oauth-limite.service';
import { ApiOauthService } from './api-oauth.service';
import { ApiFunisController } from './api-funis.controller';
import { ApiFunisService } from './api-funis.service';
import { ApiPropertiesController } from './api-properties.controller';
import { ApiPropertiesService } from './api-properties.service';
import { ApiTecnicoAdapter } from './api-tecnico.adapter';
import { ApiV1Controller } from './api-v1.controller';
import { WebhooksModule } from './webhooks/webhooks.module';

@Module({
  imports: [LeadsModule, WebhooksModule],
  controllers: [
    ApiV1Controller,
    ApiAppsController,
    ApiFunisController,
    ApiLeadsController,
    ApiPropertiesController,
  ],
  providers: [
    ApiOauthService,
    ApiOauthLimiteService,
    ApiAppsService,
    ApiFunisService,
    ApiPropertiesService,
    ApiTecnicoAdapter,
    ApiLeadsService,
    ApiAccessGuard,
    ApiAuditInterceptor,
  ],
  exports: [ApiOauthService, ApiAccessGuard],
})
export class ApiV1Module {}
