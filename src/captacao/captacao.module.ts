import { Module } from '@nestjs/common';
import { CaptacaoService } from './captacao.service';
import { CaptacoesController } from './captacoes.controller';
import { CaptacaoImoveisController } from './captacao-imoveis.controller';
import { ProprietariosController } from './proprietarios.controller';
import { PortalProprietarioModule } from '../portal-proprietario/portal-proprietario.module';
import { FunisModule } from '../funis/funis.module';
import { MediaModule } from '../media/media.module';
import { TarefasModule } from '../tarefas/tarefas.module';
import { OportunidadesCaptacaoController } from './oportunidades-captacao.controller';

@Module({
  imports: [PortalProprietarioModule, FunisModule, MediaModule, TarefasModule],
  controllers: [
    ProprietariosController,
    CaptacaoImoveisController,
    OportunidadesCaptacaoController,
    CaptacoesController,
  ],
  providers: [CaptacaoService],
  exports: [CaptacaoService],
})
export class CaptacaoModule {}
