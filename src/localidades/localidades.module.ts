import { Module } from "@nestjs/common";
import { LocalidadesController } from "./localidades.controller";
import { LocalidadesService } from "./localidades.service";

@Module({
  controllers: [LocalidadesController],
  providers: [LocalidadesService],
  exports: [LocalidadesService],
})
export class LocalidadesModule {}
