import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MediaModule } from '../media/media.module';
import { PortalProprietarioAuthController } from './portal-proprietario-auth.controller';
import { PortalProprietarioAuthService } from './portal-proprietario-auth.service';
import { PortalProprietarioImoveisService } from './portal-proprietario-imoveis.service';
import { PortalProprietarioController } from './portal-proprietario.controller';
import { PortalProprietarioAuthGuard } from './guards/portal-proprietario-auth.guard';

@Module({
  imports: [JwtModule.register({}), MediaModule],
  controllers: [
    PortalProprietarioAuthController,
    PortalProprietarioController,
  ],
  providers: [
    PortalProprietarioAuthService,
    PortalProprietarioImoveisService,
    PortalProprietarioAuthGuard,
  ],
  exports: [PortalProprietarioAuthService],
})
export class PortalProprietarioModule {}
