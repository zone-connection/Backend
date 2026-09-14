import { Module } from '@nestjs/common';
import { OzapController } from './ozap.controller';
import { OzapWebhookGuard } from './guards/ozap-webhook.guard';
import { OzapService } from './ozap.service';
import { LeadNotifyModule } from '../lead-notify/lead-notify.module';

@Module({
  imports: [LeadNotifyModule],
  controllers: [OzapController],
  providers: [OzapService, OzapWebhookGuard],
})
export class OzapModule {}
