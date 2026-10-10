import {
  Body,
  Controller,
  Delete,
  Get,
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
import { CreateMetaDto } from './dto/create-meta.dto';
import { UpdateMetaDto } from './dto/update-meta.dto';
import { MetasService } from './metas.service';

@Controller('metas')
@UseGuards(RolesGuard)
@Roles(Role.admin, Role.gerente, Role.corretor, Role.treinee, Role.super_admin)
export class MetasController {
  constructor(private readonly metasService: MetasService) {}

  @Get()
  list(@CurrentUser() requester: AuthenticatedUser) {
    return this.metasService.list(requester);
  }

  @Post()
  create(
    @Body() dto: CreateMetaDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.metasService.create(dto, requester);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMetaDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.metasService.update(id, dto, requester);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.metasService.remove(id, requester);
  }
}
