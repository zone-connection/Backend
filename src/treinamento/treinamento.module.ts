import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { TreinamentoController } from './treinamento.controller';
import { TreinamentoService } from './treinamento.service';

@Module({
  imports: [MediaModule],
  controllers: [TreinamentoController],
  providers: [TreinamentoService],
})
export class TreinamentoModule {}
