import { Module } from '@nestjs/common';
import { TenantsController } from './tenants.controller';
import { TenantCompanyController } from './tenant-company.controller';
import { TenantModulesController } from './tenant-modules.controller';
import { TenantsService } from './tenants.service';
import { BootstrapTenantConnectionsService } from './bootstrap-tenant-connections.service';
import { TenantLogoColorService } from './tenant-logo-color.service';
import { TenantDemoDataService } from './tenant-demo-data.service';
import { OruloModule } from '../orulo/orulo.module';
import { MediaModule } from '../media/media.module';

@Module({
  imports: [OruloModule, MediaModule],
  controllers: [
    TenantCompanyController,
    TenantModulesController,
    TenantsController,
  ],
  providers: [
    TenantsService,
    TenantDemoDataService,
    BootstrapTenantConnectionsService,
    TenantLogoColorService,
  ],
  exports: [TenantsService, TenantLogoColorService],
})
export class TenantsModule {}
