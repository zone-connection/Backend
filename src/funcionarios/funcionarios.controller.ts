import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import {
  CreateFuncionarioDto,
  UpdateFuncionarioDto,
} from './dto/funcionario.dto';
import { FuncionariosService } from './funcionarios.service';

const STAFF = [Role.admin, Role.financeiro, Role.super_admin] as const;

@Controller('funcionarios')
@UseGuards(RolesGuard)
export class FuncionariosController {
  constructor(private readonly funcionarios: FuncionariosService) {}

  @Get()
  @Roles(...STAFF)
  list(@CurrentUser() requester: AuthenticatedUser) {
    return this.funcionarios.list(requester);
  }

  @Get(':id')
  @Roles(...STAFF)
  get(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.funcionarios.get(id, requester);
  }

  @Get(':id/contracheques')
  @Roles(...STAFF)
  historico(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.funcionarios.historico(id, requester);
  }

  @Post()
  @Roles(...STAFF)
  create(
    @Body() dto: CreateFuncionarioDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.funcionarios.create(dto, requester);
  }

  @Patch(':id')
  @Roles(...STAFF)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFuncionarioDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.funcionarios.update(id, dto, requester);
  }

  @Delete(':id')
  @Roles(...STAFF)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.funcionarios.remove(id, requester);
  }

  @Post(':id/contracheque/pdf')
  @Roles(...STAFF)
  @Header('Content-Type', 'application/pdf')
  async emitirPdf(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    const { buffer, filename } = await this.funcionarios.emitirPdf(
      id,
      requester,
    );
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="${filename}"`,
    });
  }
}
