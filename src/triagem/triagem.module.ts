import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { EquipesModule } from '../equipes/equipes.module';
import { AnaliseModule } from '../analise/analise.module';
import { FunisModule } from '../funis/funis.module';
import { LeadMonitoramentoModule } from '../leads/lead-monitoramento.module';
import { TriagemController } from './triagem.controller';
import { TriagemService } from './triagem.service';

@Module({
  imports: [
    CatalogModule,
    EquipesModule,
    AnaliseModule,
    FunisModule,
    LeadMonitoramentoModule,
  ],
  controllers: [TriagemController],
  providers: [TriagemService],
})
export class TriagemModule {}
