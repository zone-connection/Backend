import { Module } from '@nestjs/common';
import { OzapController } from './ozap.controller';
import { OzapWebhookGuard } from './guards/ozap-webhook.guard';
import { OzapService } from './ozap.service';
import { LeadNotifyModule } from '../lead-notify/lead-notify.module';
import { FunisModule } from '../funis/funis.module';
import { OzapApiModule } from './ozap-api.module';
import { WhatsappInboxController } from './whatsapp-inbox.controller';
import { WhatsappInboxService } from './whatsapp-inbox.service';

@Module({
  imports: [LeadNotifyModule, FunisModule, OzapApiModule],
  controllers: [OzapController, WhatsappInboxController],
  providers: [OzapService, OzapWebhookGuard, WhatsappInboxService],
})
export class OzapModule {}
