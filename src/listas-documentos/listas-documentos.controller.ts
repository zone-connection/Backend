import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import {
  CreateListaDocumentoDto,
  UpdateListaDocumentoDto,
} from './dto/lista-documento.dto';
import { ListasDocumentosService } from './listas-documentos.service';

const GESTORES: Role[] = [Role.admin, Role.gerente, Role.super_admin];

@Controller('listas-documentos')
@UseGuards(RolesGuard)
@Roles(...GESTORES)
export class ListasDocumentosController {
  constructor(private readonly listas: ListasDocumentosService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.listas.list(user);
  }

  @Post()
  create(
    @Body() dto: CreateListaDocumentoDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.listas.create(dto, user);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateListaDocumentoDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.listas.update(id, dto, user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.listas.remove(id, user);
  }
}
