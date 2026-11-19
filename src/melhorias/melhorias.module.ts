import { Module } from '@nestjs/common';
import { MelhoriasController } from './melhorias.controller';
import { MelhoriasService } from './melhorias.service';

@Module({
  controllers: [MelhoriasController],
  providers: [MelhoriasService],
})
export class MelhoriasModule {}
