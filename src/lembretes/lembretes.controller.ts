import {
  Body,
  Controller,
  Delete,
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
import { CreateLembreteDto, UpdateLembreteDto } from './dto/lembrete.dto';
import { LembretesService } from './lembretes.service';

@Controller('lembretes')
@UseGuards(RolesGuard)
@Roles(
  Role.super_admin,
  Role.admin,
  Role.gerente,
  Role.corretor,
  Role.treinee,
  Role.analista,
  Role.financeiro,
  Role.assistente,
)
export class LembretesController {
  constructor(private readonly lembretes: LembretesService) {}

  @Get()
  list(@CurrentUser() requester: AuthenticatedUser) {
    return this.lembretes.list(requester);
  }

  @Get('pendentes')
  pendentes(@CurrentUser() requester: AuthenticatedUser) {
    return this.lembretes.pendentes(requester);
  }

  @Post()
  create(
    @Body() dto: CreateLembreteDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.lembretes.create(dto, requester);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLembreteDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.lembretes.update(id, dto, requester);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.lembretes.remove(id, requester);
  }

  @Post('reconhecer')
  @HttpCode(HttpStatus.OK)
  reconhecerPendentes(@CurrentUser() requester: AuthenticatedUser) {
    return this.lembretes.reconhecerPendentes(requester);
  }

  @Post(':id/reconhecer')
  @HttpCode(HttpStatus.OK)
  reconhecer(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.lembretes.reconhecer(id, requester);
  }
}
