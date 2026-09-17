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
import { BaixarParcelaDto } from './dto/baixar-parcela.dto';
import { CreatePlatformContratoComTitulosDto } from './dto/create-platform-contrato-com-titulos.dto';
import { CreatePlatformContratoDto } from './dto/create-platform-contrato.dto';
import { UpdatePlatformContratoDto } from './dto/update-platform-contrato.dto';
import { PlatformContratosService } from './platform-contratos.service';

@Controller('platform-contratos')
@UseGuards(RolesGuard)
@Roles(Role.super_admin)
export class PlatformContratosController {
  constructor(private readonly service: PlatformContratosService) {}

  @Get()
  list(@CurrentUser() requester: AuthenticatedUser) {
    return this.service.list(requester);
  }

  @Post('com-titulos')
  createComTitulos(
    @Body() dto: CreatePlatformContratoComTitulosDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.service.createComTitulos(dto, requester);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.service.findOne(id, requester);
  }

  @Post()
  create(
    @Body() dto: CreatePlatformContratoDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.service.create(dto, requester);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePlatformContratoDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.service.update(id, dto, requester);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.service.remove(id, requester);
  }

  @Post(':id/parcelas/:parcelaId/baixar')
  baixarParcela(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('parcelaId', ParseUUIDPipe) parcelaId: string,
    @Body() dto: BaixarParcelaDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.service.baixarParcela(id, parcelaId, dto, requester);
  }
}
