import {
  Body,
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
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { Role } from '@prisma/client';
import { ParceriasService } from './parcerias.service';
import {
  CompartilharLeadDto,
  ConvidarParceiroDto,
  CreateRepasseDto,
  LiberarImovelDto,
  UpdateParceriaDto,
} from './dto/parcerias.dto';

const ROLES = [
  Role.admin,
  Role.gerente,
  Role.corretor,
  Role.analista,
  Role.treinee,
] as const;

@Controller('parcerias')
@UseGuards(RolesGuard)
export class ParceriasController {
  constructor(private readonly parcerias: ParceriasService) {}

  @Get()
  @Roles(...ROLES)
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.parcerias.list(user);
  }

  @Get('imoveis')
  @Roles(...ROLES)
  imoveis(@CurrentUser() user: AuthenticatedUser) {
    return this.parcerias.listImoveisVitrine(user);
  }

  @Get(':id')
  @Roles(...ROLES)
  get(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.parcerias.get(id, user);
  }

  @Post()
  @Roles(...ROLES)
  convidar(
    @Body() dto: ConvidarParceiroDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.parcerias.convidar(dto, user);
  }

  @Patch(':id')
  @Roles(...ROLES)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateParceriaDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.parcerias.update(id, dto, user);
  }

  @Patch('imoveis/:id')
  @Roles(...ROLES)
  liberar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LiberarImovelDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.parcerias.setImovelLiberado(id, dto.liberado, user);
  }

  @Post(':id/leads')
  @Roles(...ROLES)
  compartilharLead(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompartilharLeadDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.parcerias.compartilharLead(id, dto.leadId, user);
  }

  @Post(':id/repasses')
  @Roles(...ROLES)
  repasse(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateRepasseDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.parcerias.createRepasse(id, dto, user);
  }
}
