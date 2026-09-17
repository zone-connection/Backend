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

@Module({
  imports: [JwtModule.register({})],
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
