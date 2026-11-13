import { Module } from '@nestjs/common';
import { FunisController } from './funis.controller';
import { FunisService } from './funis.service';
import { FunilResolverService } from './funil-resolver.service';
import { LeadMonitoramentoModule } from '../leads/lead-monitoramento.module';

@Module({
  imports: [LeadMonitoramentoModule],
  controllers: [FunisController],
  providers: [FunisService, FunilResolverService],
  exports: [FunisService, FunilResolverService],
})
export class FunisModule {}
