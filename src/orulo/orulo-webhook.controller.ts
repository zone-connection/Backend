import { Body, Controller, Post } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import type { OruloWebhookPayload } from './orulo-api.types';
import { OruloSyncService } from './orulo-sync.service';

@Controller('webhooks/orulo')
export class OruloWebhookController {
  constructor(private readonly sync: OruloSyncService) {}

  @Post()
  @Public()
  @SkipThrottle()
  receive(@Body() payload: OruloWebhookPayload) {
    return this.sync.handleWebhook(payload ?? {});
  }
}
