import { Module } from '@nestjs/common';
import { AgendaModule } from '../agenda/agenda.module';
import { MailerModule } from '../mailer/mailer.module';
import { TarefasController } from './tarefas.controller';
import { TarefasService } from './tarefas.service';

@Module({
  imports: [MailerModule, AgendaModule],
  controllers: [TarefasController],
  providers: [TarefasService],
})
export class TarefasModule {}
