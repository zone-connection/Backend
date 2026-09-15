import { Module } from '@nestjs/common';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';
import { CatalogModule } from '../catalog/catalog.module';
import { EquipesModule } from '../equipes/equipes.module';
import { AnaliseModule } from '../analise/analise.module';
import { FunisModule } from '../funis/funis.module';
import { LeadMonitoramentoModule } from './lead-monitoramento.module';
import { LeadAtrasoLiberacaoService } from './lead-atraso-liberacao.service';
import { DocumentacaoModule } from '../documentacao/documentacao.module';
import { LeadNotifyModule } from '../lead-notify/lead-notify.module';

@Module({
  imports: [
    CatalogModule,
    EquipesModule,
    AnaliseModule,
    FunisModule,
    LeadMonitoramentoModule,
    DocumentacaoModule,
    LeadNotifyModule,
  ],
  controllers: [LeadsController],
  providers: [LeadsService, LeadAtrasoLiberacaoService],
  exports: [LeadsService],
})
export class LeadsModule {}
