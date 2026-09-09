import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { MatchingModule } from '../matching/matching.module';
import { EmpreendimentosController } from './empreendimentos.controller';
import { EmpreendimentosService } from './empreendimentos.service';

@Module({
  imports: [MediaModule, MatchingModule],
  controllers: [EmpreendimentosController],
  providers: [EmpreendimentosService],
  exports: [EmpreendimentosService],
})
export class EmpreendimentosModule {}
