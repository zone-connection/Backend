import { Module } from '@nestjs/common';
import { AgendaModule } from '../agenda/agenda.module';
import { EquipesModule } from '../equipes/equipes.module';
import { MailerModule } from '../mailer/mailer.module';
import { TarefasController } from './tarefas.controller';
import { TarefasService } from './tarefas.service';

@Module({
  imports: [MailerModule, AgendaModule, EquipesModule],
  controllers: [TarefasController],
  providers: [TarefasService],
})
export class TarefasModule {}
