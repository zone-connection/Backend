import {
  Body,
  Controller,
  Header,
  Post,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { GenerateContratoDto } from './dto/generate-contrato.dto';
import { ContratosService } from './contratos.service';

@Controller('contratos')
@UseGuards(RolesGuard)
export class ContratosController {
  constructor(private readonly contratosService: ContratosService) {}

  @Post('pdf')
  @Roles(Role.admin, Role.gerente, Role.corretor, Role.analista, Role.treinee, Role.super_admin)
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
