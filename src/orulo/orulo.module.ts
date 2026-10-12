import { Module } from '@nestjs/common';
import { OruloApiClient } from './orulo-api.client';
import { OruloController } from './orulo.controller';
import { OruloService } from './orulo.service';
import { OruloSyncService } from './orulo-sync.service';
import { OruloWebhookController } from './orulo-webhook.controller';

@Module({
  controllers: [OruloController, OruloWebhookController],
  providers: [OruloApiClient, OruloService, OruloSyncService],
  exports: [OruloService, OruloSyncService],
})
export class OruloModule {}
