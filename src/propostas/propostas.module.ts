import { Module } from '@nestjs/common';
import { EquipesModule } from '../equipes/equipes.module';
import { MailerModule } from '../mailer/mailer.module';
import { PropostaVinculosService } from './proposta-vinculos.service';
import { PropostasController } from './propostas.controller';
import { PropostasService } from './propostas.service';

@Module({
  imports: [EquipesModule, MailerModule],
  controllers: [PropostasController],
  providers: [PropostasService, PropostaVinculosService],
  exports: [PropostasService],
})
export class PropostasModule {}
