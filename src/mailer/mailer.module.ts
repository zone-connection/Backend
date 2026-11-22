import { Module } from '@nestjs/common';
import { AccountMailService } from './account-mail.service';
import { EmailOpsService } from './email-ops.service';
import { MailerService } from './mailer.service';

@Module({
  providers: [MailerService, AccountMailService, EmailOpsService],
  exports: [MailerService, AccountMailService],
})
export class MailerModule {}
