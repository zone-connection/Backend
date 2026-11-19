import { Module } from '@nestjs/common';
import { EquipesModule } from '../equipes/equipes.module';
import { MailerModule } from '../mailer/mailer.module';
import { PresenceModule } from '../presence/presence.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [EquipesModule, PresenceModule, MailerModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
