import { Body, Controller, Delete, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { IsBoolean } from 'class-validator';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { EvolutionService } from './evolution.service';

class NotificationsDto {
  @IsBoolean()
  enabled!: boolean;
}

@Controller('me/whatsapp')
export class EvolutionMeController {
  constructor(private readonly evolution: EvolutionService) {}

  @Get()
  mine(@CurrentUser() user: AuthenticatedUser) {
    return this.evolution.refresh(user);
  }

  @Post('conectar')
  connect(@CurrentUser() user: AuthenticatedUser) {
    return this.evolution.connect(user);
  }

  @Post('remetente')
  @UseGuards(RolesGuard)
  @Roles(Role.admin, Role.gerente, Role.super_admin)
  sender(@CurrentUser() user: AuthenticatedUser) {
    return this.evolution.connectSender(user);
  }

  @Delete()
  disconnect(@CurrentUser() user: AuthenticatedUser) {
    return this.evolution.disconnect(user);
  }

  @Patch('avisos')
  notifications(@CurrentUser() user: AuthenticatedUser, @Body() body: NotificationsDto) {
    return this.evolution.setNotifications(user, body.enabled === true);
  }
}

@Controller('whatsapp-conexoes')
export class EvolutionTeamController {
  constructor(private readonly evolution: EvolutionService) {}

  @Get()
  @UseGuards(RolesGuard)
  @Roles(Role.admin, Role.gerente)
  team(@CurrentUser() user: AuthenticatedUser) {
    return this.evolution.team(user);
  }
}
