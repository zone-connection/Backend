import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { EvolutionWebhookGuard } from './evolution-webhook.guard';
import { EvolutionService } from './evolution.service';

@Controller('webhooks/evolution')
export class EvolutionWebhookController {
  constructor(private readonly evolution: EvolutionService) {}

  @Public()
  @UseGuards(EvolutionWebhookGuard)
  @Post()
  @HttpCode(204)
  async receive(@Body() body: unknown): Promise<void> {
    await this.evolution.applyWebhook(body);
  }
}
