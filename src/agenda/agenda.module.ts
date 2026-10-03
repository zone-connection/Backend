import { Module } from '@nestjs/common';
import { EquipesModule } from '../equipes/equipes.module';
import { NotificacoesModule } from '../notificacoes/notificacoes.module';
import { LeadMonitoramentoModule } from '../leads/lead-monitoramento.module';
import { GoogleCalendarModule } from '../google-calendar/google-calendar.module';
import { AgendaController } from './agenda.controller';
import { AgendaService } from './agenda.service';

@Module({
  imports: [
    EquipesModule,
    NotificacoesModule,
    LeadMonitoramentoModule,
    GoogleCalendarModule,
  ],
  controllers: [AgendaController],
  providers: [AgendaService],
  exports: [AgendaService],
})
export class AgendaModule {}
