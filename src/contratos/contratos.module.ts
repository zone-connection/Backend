import { Module } from '@nestjs/common';
import { TenantsModule } from '../tenants/tenants.module';
import { ContratosController } from './contratos.controller';
import { ContratosService } from './contratos.service';

@Module({
  imports: [TenantsModule],
  controllers: [ContratosController],
  providers: [ContratosService],
})
export class ContratosModule {}
