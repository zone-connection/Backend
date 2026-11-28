import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ParceriasController } from './parcerias.controller';
import { ParceriasService } from './parcerias.service';
import { ParceiroAuthService } from './parceiro-auth.service';
import {
  PortalParceiroAuthController,
  PortalParceiroController,
} from './portal-parceiro.controller';
import { PortalParceiroAuthGuard } from './guards/portal-parceiro-auth.guard';
import { FunisModule } from '../funis/funis.module';

@Module({
  imports: [JwtModule.register({}), FunisModule],
  controllers: [
    ParceriasController,
    PortalParceiroAuthController,
    PortalParceiroController,
  ],
  providers: [
    ParceriasService,
    ParceiroAuthService,
    PortalParceiroAuthGuard,
  ],
})
export class ParceriasModule {}
