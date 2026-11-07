import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { ApiOauthLimiteService } from '../api-oauth-limite.service';
import { ApiOauthService } from '../api-oauth.service';
import { ApiWebhooksController } from './api-webhooks.controller';
import { WebhookWorkerService } from './webhook-worker.service';
import {
  WebhookDestinosService,
  WebhookEntregaService,
  WebhookEventosService,
} from './webhooks.service';

@Module({
  imports: [PrismaModule],
  controllers: [ApiWebhooksController],
  providers: [
    ApiOauthLimiteService,
    ApiOauthService,
    WebhookDestinosService,
    WebhookEventosService,
    WebhookEntregaService,
    WebhookWorkerService,
  ],
  exports: [WebhookEventosService],
})
export class WebhooksModule {}
