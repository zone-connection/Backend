import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { FinanceiroController } from './financeiro.controller';
import { FinanceiroService } from './financeiro.service';
import { NotasFiscaisController } from './notas-fiscais.controller';
import { NotasFiscaisService } from './notas-fiscais.service';

@Module({
  imports: [MediaModule],
  controllers: [FinanceiroController, NotasFiscaisController],
  providers: [FinanceiroService, NotasFiscaisService],
  exports: [FinanceiroService],
})
export class FinanceiroModule {}
