import { Module } from '@nestjs/common';
import { EquipesModule } from '../equipes/equipes.module';
import { MailerModule } from '../mailer/mailer.module';
import { NotificacoesModule } from '../notificacoes/notificacoes.module';
import { PropostaHistoricoService } from './proposta-historico.service';
import { PropostaPublicaService } from './proposta-publica.service';
import { PropostaVinculosService } from './proposta-vinculos.service';
import { PropostasController } from './propostas.controller';
import { PropostasService } from './propostas.service';
import { PublicoPropostasController } from './publico-propostas.controller';

@Module({
  imports: [EquipesModule, MailerModule, NotificacoesModule],
  controllers: [PropostasController, PublicoPropostasController],
  providers: [
    PropostasService,
    PropostaVinculosService,
    PropostaHistoricoService,
    PropostaPublicaService,
  ],
  exports: [PropostasService, PropostaHistoricoService],
})
export class PropostasModule {}
