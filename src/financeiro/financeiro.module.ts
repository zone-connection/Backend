import { Module } from '@nestjs/common';
import { DocumentacaoModule } from '../documentacao/documentacao.module';
import { LeadsModule } from '../leads/leads.module';
import { FinanceiroController } from './financeiro.controller';
import { FinanceiroService } from './financeiro.service';

@Module({
  imports: [LeadsModule, DocumentacaoModule],
  controllers: [FinanceiroController],
  providers: [FinanceiroService],
  exports: [FinanceiroService],
})
export class FinanceiroModule {}
