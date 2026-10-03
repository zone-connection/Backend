import { Module } from '@nestjs/common';
import { EquipesModule } from '../equipes/equipes.module';
import { NotificacoesModule } from '../notificacoes/notificacoes.module';
import { LeadMonitoramentoService } from './monitoramento/lead-monitoramento.service';

@Module({
  imports: [EquipesModule, NotificacoesModule],
  providers: [LeadMonitoramentoService],
  exports: [LeadMonitoramentoService],
})
export class LeadMonitoramentoModule {}
