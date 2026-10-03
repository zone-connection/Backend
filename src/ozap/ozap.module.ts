import { Module } from '@nestjs/common';
import { OzapController } from './ozap.controller';
import { OzapWebhookGuard } from './guards/ozap-webhook.guard';
import { OzapService } from './ozap.service';
import { LeadNotifyModule } from '../lead-notify/lead-notify.module';
import { FunisModule } from '../funis/funis.module';

@Module({
  imports: [LeadNotifyModule, FunisModule],
  controllers: [OzapController],
  providers: [OzapService, OzapWebhookGuard],
})
export class OzapModule {}
