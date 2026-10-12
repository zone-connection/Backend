import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { FunisModule } from '../funis/funis.module';
import { LeadNotifyModule } from '../lead-notify/lead-notify.module';
import { GrupoZapController } from './grupozap.controller';
import {
  GrupoZapFeedController,
  GrupoZapWebhookController,
} from './grupozap-webhook.controller';
import { GrupoZapService } from './grupozap.service';
import { GrupoZapWebhookGuard } from './guards/grupozap-webhook.guard';

@Module({
  imports: [FunisModule, CatalogModule, LeadNotifyModule],
  controllers: [
    GrupoZapController,
    GrupoZapWebhookController,
    GrupoZapFeedController,
  ],
  providers: [GrupoZapService, GrupoZapWebhookGuard],
})
export class GrupoZapModule {}
