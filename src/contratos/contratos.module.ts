import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { TenantsModule } from '../tenants/tenants.module';
import { ContratosController } from './contratos.controller';
import { ContratosService } from './contratos.service';

@Module({
  imports: [TenantsModule, MediaModule],
  controllers: [ContratosController],
  providers: [ContratosService],
})
export class ContratosModule {}
