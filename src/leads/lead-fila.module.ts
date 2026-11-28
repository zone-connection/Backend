import { Module } from '@nestjs/common';
import { LeadNotifyModule } from '../lead-notify/lead-notify.module';
import { LeadFilaController } from './lead-fila.controller';
import { LeadFilaService } from './lead-fila.service';

@Module({
  imports: [LeadNotifyModule],
  controllers: [LeadFilaController],
  providers: [LeadFilaService],
  exports: [LeadFilaService],
})
export class LeadFilaModule {}
