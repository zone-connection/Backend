import { Module } from '@nestjs/common';
import { MailerModule } from '../mailer/mailer.module';
import { ArquivosController } from './arquivos.controller';
import { ArquivosService } from './arquivos.service';
import { R2Service } from './r2.service';

@Module({
  imports: [MailerModule],
  controllers: [ArquivosController],
  providers: [ArquivosService, R2Service],
  exports: [ArquivosService],
})
export class ArquivosModule {}
