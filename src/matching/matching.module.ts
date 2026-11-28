import { Module } from '@nestjs/common';
import { NotificacoesModule } from '../notificacoes/notificacoes.module';
import { MatchingService } from './matching.service';

@Module({
  imports: [NotificacoesModule],
  providers: [MatchingService],
  exports: [MatchingService],
})
export class MatchingModule {}
