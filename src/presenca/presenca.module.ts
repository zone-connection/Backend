import { Module } from '@nestjs/common';
import { PresencaController } from './presenca.controller';
import { PresencaService } from './presenca.service';

@Module({
  controllers: [PresencaController],
  providers: [PresencaService],
})
export class PresencaModule {}
