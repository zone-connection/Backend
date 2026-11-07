import { Module } from '@nestjs/common';
import { EvolutionApiClient } from './evolution-api.client';
import { EvolutionMeController, EvolutionTeamController } from './evolution.controller';
import { EvolutionService } from './evolution.service';
import { EvolutionWebhookController } from './evolution-webhook.controller';
import { EvolutionWebhookGuard } from './evolution-webhook.guard';

@Module({
  controllers: [EvolutionMeController, EvolutionTeamController, EvolutionWebhookController],
  providers: [EvolutionApiClient, EvolutionService, EvolutionWebhookGuard],
  exports: [EvolutionService],
})
export class EvolutionModule {}
