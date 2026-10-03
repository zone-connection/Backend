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
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import {
  GenerateContratoDto,
  UpsertContratoDocumentoDto,
} from './dto/generate-contrato.dto';
import { ContratosService } from './contratos.service';

const ROLES = [
  Role.admin,
  Role.gerente,
  Role.corretor,
  Role.analista,
  Role.treinee,
  Role.super_admin,
] as const;

@Controller('contratos')
@UseGuards(RolesGuard)
export class ContratosController {
  constructor(private readonly contratosService: ContratosService) {}

  @Get('documentos')
  @Roles(...ROLES)
  list(@CurrentUser() requester: AuthenticatedUser) {
    return this.contratosService.listDocumentos(requester);
  }

  @Post('documentos')
  @Roles(...ROLES)
  create(
    @Body() dto: UpsertContratoDocumentoDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.contratosService.upsertDocumento(dto, requester);
  }

  @Patch('documentos/:id')
  @Roles(...ROLES)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpsertContratoDocumentoDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.contratosService.upsertDocumento(dto, requester, id);
  }

  @Delete('documentos/:id')
  @Roles(...ROLES)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.contratosService.removeDocumento(id, requester);
  }

  @Post('pdf')
  @Roles(...ROLES)
  @Header('Content-Type', 'application/pdf')
  async generatePdf(
    @Body() dto: GenerateContratoDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    const { buffer, filename } = await this.contratosService.generatePdf(
      dto,
      requester,
    );
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="${filename}"`,
    });
  }
}
