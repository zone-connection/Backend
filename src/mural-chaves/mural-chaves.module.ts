import { Module } from '@nestjs/common';
import { MuralChavesController } from './mural-chaves.controller';
import { MuralChavesService } from './mural-chaves.service';

@Module({
  controllers: [MuralChavesController],
  providers: [MuralChavesService],
})
export class MuralChavesModule {}
