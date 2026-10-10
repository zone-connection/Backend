import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import type { OruloWebhookPayload } from './orulo-api.types';
import { OruloSyncService } from './orulo-sync.service';

/**
 * A Órulo não envia assinatura. Ela exige HTTP 200 — qualquer outro código
 * conta como falha de entrega e ela reenvia. Por isso o limite global por IP
 * fica de fora: um pico legítimo sairia 429 e a integração pareceria quebrada.
 * O que impede apagar o catálogo é a confirmação na API, em OruloSyncService.
 */
@Controller('webhooks/orulo')
export class OruloWebhookController {
  constructor(private readonly sync: OruloSyncService) {}

  @Get()
  @Public()
  @SkipThrottle()
  ping() {
    return {
      ok: true,
      message:
        'Webhook Órulo ativo. As notificações de catálogo devem ser enviadas via POST.',
    };
  }

  @Post()
  @Public()
  @SkipThrottle()
  @HttpCode(200)
  receive(@Body() payload: OruloWebhookPayload) {
    return this.sync.handleWebhook(payload ?? {});
  }
}
