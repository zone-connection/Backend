import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
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
    WebhookDestinosService,
    WebhookEventosService,
    WebhookEntregaService,
    WebhookWorkerService,
  ],
  exports: [WebhookEventosService],
})
export class WebhooksModule {}
