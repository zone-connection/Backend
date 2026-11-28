import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { CreateOnboardingDto, UpdateOnboardingDto, UpdateOnboardingEtapaDto } from './dto/onboarding.dto';
import { OnboardingService } from './onboarding.service';

@Controller('onboarding')
@UseGuards(RolesGuard)
@Roles(Role.super_admin)
export class OnboardingController {
  constructor(private readonly service: OnboardingService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query('situacao') situacao?: string) {
    return this.service.list(user, situacao);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.findOne(id, user);
  }

  @Post()
  create(@Body() dto: CreateOnboardingDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.create(dto, user);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOnboardingDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.update(id, dto, user);
  }

  @Patch(':id/etapas/:etapaId')
  updateEtapa(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('etapaId', ParseUUIDPipe) etapaId: string,
    @Body() dto: UpdateOnboardingEtapaDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.updateEtapa(id, etapaId, dto, user);
  }
}
