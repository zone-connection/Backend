import { Module } from '@nestjs/common';
import { CaptacaoService } from './captacao.service';
import { CaptacoesController } from './captacoes.controller';
import { CaptacaoImoveisController } from './captacao-imoveis.controller';
import { ProprietariosController } from './proprietarios.controller';
import { PortalProprietarioModule } from '../portal-proprietario/portal-proprietario.module';
import { FunisModule } from '../funis/funis.module';
import { MediaModule } from '../media/media.module';

@Module({
  imports: [PortalProprietarioModule, FunisModule, MediaModule],
  controllers: [
    ProprietariosController,
    CaptacaoImoveisController,
    CaptacoesController,
  ],
  providers: [CaptacaoService],
  exports: [CaptacaoService],
})
export class CaptacaoModule {}
