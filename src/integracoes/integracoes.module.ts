import { Module } from '@nestjs/common';
import { FunisModule } from '../funis/funis.module';
import { LeadMonitoramentoModule } from '../leads/lead-monitoramento.module';
import { IntegracoesController } from './integracoes.controller';
import { IntegracoesService } from './integracoes.service';

@Module({
  imports: [FunisModule, LeadMonitoramentoModule],
  controllers: [IntegracoesController],
  providers: [IntegracoesService],
  exports: [IntegracoesService],
})
export class IntegracoesModule {}
