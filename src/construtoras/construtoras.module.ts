import { Module } from '@nestjs/common';
import { EquipesModule } from '../equipes/equipes.module';
import { MediaModule } from '../media/media.module';
import { ConstrutorasController } from './construtoras.controller';
import { ConstrutorasService } from './construtoras.service';

@Module({
  imports: [EquipesModule, MediaModule],
  controllers: [ConstrutorasController],
  providers: [ConstrutorasService],
  exports: [ConstrutorasService],
})
export class ConstrutorasModule {}
