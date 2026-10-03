import { Module } from '@nestjs/common';
import { EquipesModule } from '../equipes/equipes.module';
import { NotificacoesModule } from '../notificacoes/notificacoes.module';
import { FunisModule } from '../funis/funis.module';
import { LeadMonitoramentoModule } from '../leads/lead-monitoramento.module';
import { AnaliseController } from './analise.controller';
import { AnaliseService } from './analise.service';

@Module({
  imports: [EquipesModule, NotificacoesModule, FunisModule, LeadMonitoramentoModule],
  controllers: [AnaliseController],
  providers: [AnaliseService],
  exports: [AnaliseService],
})
export class AnaliseModule {}
