import { Module } from '@nestjs/common';
import { MailerModule } from '../mailer/mailer.module';
import { AssinaturaAvisosService } from './assinatura-avisos.service';
import { PlatformContratosController } from './platform-contratos.controller';
import { PlatformContratosService } from './platform-contratos.service';

@Module({
  imports: [MailerModule],
  controllers: [PlatformContratosController],
  providers: [PlatformContratosService, AssinaturaAvisosService],
  exports: [PlatformContratosService],
})
export class PlatformContratosModule {}
