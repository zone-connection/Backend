import { Module } from '@nestjs/common';
import { NotificacoesModule } from '../notificacoes/notificacoes.module';
import { OzapApiModule } from '../ozap/ozap-api.module';
import { MailerModule } from '../mailer/mailer.module';
import { LeadNotifyService } from './lead-notify.service';
import { EvolutionModule } from '../evolution/evolution.module';

@Module({
  imports: [OzapApiModule, MailerModule, NotificacoesModule, EvolutionModule],
  providers: [LeadNotifyService],
  exports: [LeadNotifyService],
})
export class LeadNotifyModule {}
