import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { RhController } from './rh.controller';
import { RhService } from './rh.service';

@Module({
  imports: [UsersModule],
  controllers: [RhController],
  providers: [RhService],
})
export class RhModule {}
