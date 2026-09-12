import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { imageUploadInterceptor } from '../media/media.constants';
import { UpdateTenantCompanyDto } from './dto/update-tenant-company.dto';
import { TenantsService } from './tenants.service';

/**
 * Cadastro da imobiliária do tenant logado.
 * Leitura: admin/gerente (contratos). Escrita: só admin.
 */
@Controller('tenant/company')
@UseGuards(RolesGuard)
export class TenantCompanyController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get()
  @Roles(Role.admin, Role.gerente)
  getCompany(@CurrentUser() requester: AuthenticatedUser) {
    return this.tenantsService.getCompanyProfile(requester);
  }

  @Patch()
  @Roles(Role.admin)
  updateCompany(
    @CurrentUser() requester: AuthenticatedUser,
    @Body() dto: UpdateTenantCompanyDto,
  ) {
    return this.tenantsService.updateCompanyProfile(requester, dto);
  }

  @Post('logo')
  @Roles(Role.admin)
  @UseInterceptors(imageUploadInterceptor())
  uploadLogo(
    @CurrentUser() requester: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.tenantsService.uploadCompanyLogo(requester, file);
  }

  @Delete('logo')
  @Roles(Role.admin)
  removeLogo(@CurrentUser() requester: AuthenticatedUser) {
    return this.tenantsService.removeCompanyLogo(requester);
  }
}
