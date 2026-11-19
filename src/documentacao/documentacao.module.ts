import { Module } from '@nestjs/common';
import { EquipesModule } from '../equipes/equipes.module';
import { DocumentacaoController } from './documentacao.controller';
import { DocumentacaoService } from './documentacao.service';

@Module({
  imports: [EquipesModule],
  controllers: [DocumentacaoController],
  providers: [DocumentacaoService],
  exports: [DocumentacaoService],
})
export class DocumentacaoModule {}
