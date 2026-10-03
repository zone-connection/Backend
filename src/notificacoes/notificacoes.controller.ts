import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { NotificacoesService } from './notificacoes.service';

@Controller('notificacoes')
@UseGuards(RolesGuard)
@Roles(
    Role.admin,
    Role.gerente,
    Role.corretor,
    Role.treinee,
    Role.analista,
    Role.financeiro,
  )
export class NotificacoesController {
  constructor(private readonly notificacoesService: NotificacoesService) {}

  @Get()
  list(@CurrentUser() requester: AuthenticatedUser) {
    return this.notificacoesService.list(requester);
  }

  @Patch(':id/lida')
  markRead(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.notificacoesService.markRead(id, requester);
  }

  @Post('lidas')
  @HttpCode(HttpStatus.OK)
  markAllRead(@CurrentUser() requester: AuthenticatedUser) {
    return this.notificacoesService.markAllRead(requester);
  }
}
