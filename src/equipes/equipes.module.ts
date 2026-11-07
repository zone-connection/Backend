import { Module } from '@nestjs/common';
import { EquipesController } from './equipes.controller';
import { EquipesService } from './equipes.service';
import { EquipeFunisService } from './equipe-funis.service';
import { TeamScopeService } from './team-scope.service';

@Module({
  controllers: [EquipesController],
  providers: [EquipesService, EquipeFunisService, TeamScopeService],
  exports: [TeamScopeService],
})
export class EquipesModule {}
