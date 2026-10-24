import { Module } from '@nestjs/common';
import { NotificacoesModule } from '../notificacoes/notificacoes.module';
import { ProcessosController } from './processos.controller';
import { ProcessosService } from './processos.service';

@Module({
  imports: [NotificacoesModule],
  controllers: [ProcessosController],
  providers: [ProcessosService],
  exports: [ProcessosService],
})
export class ProcessosModule {}
