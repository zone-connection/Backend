import { Module } from '@nestjs/common';
import { EquipesModule } from '../equipes/equipes.module';
import { PresenceModule } from '../presence/presence.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [EquipesModule, PresenceModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
