import { Module } from '@nestjs/common';
import { AccountMailService } from './account-mail.service';
import { MailerService } from './mailer.service';

@Module({
  providers: [MailerService, AccountMailService],
  exports: [MailerService, AccountMailService],
})
export class MailerModule {}
