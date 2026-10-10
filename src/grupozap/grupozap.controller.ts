import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { UpdateGrupoZapDto } from './dto/update-grupozap.dto';
import { GrupoZapService } from './grupozap.service';

@Controller('integrations/grupozap')
@UseGuards(RolesGuard)
export class GrupoZapController {
  constructor(private readonly grupozap: GrupoZapService) {}

  @Get('status')
  @Roles(Role.admin, Role.gerente, Role.super_admin)
  status(@CurrentUser() user: AuthenticatedUser) {
    return this.grupozap.status(user);
  }

  @Post('connect')
  @Roles(Role.admin, Role.super_admin)
  connect(@CurrentUser() user: AuthenticatedUser) {
    return this.grupozap.connect(user);
  }

  @Post('disconnect')
  @Roles(Role.admin, Role.super_admin)
  disconnect(@CurrentUser() user: AuthenticatedUser) {
    return this.grupozap.disconnect(user);
  }

  @Patch()
  @Roles(Role.admin, Role.super_admin)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateGrupoZapDto,
  ) {
    return this.grupozap.update(user, dto.displayAddress);
  }
}
