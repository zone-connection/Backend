import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { FinanceiroPermsGuard } from '../common/guards/financeiro-perms.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { DOCUMENT_MAX_BYTES } from '../media/media.constants';
import {
  NotaFiscalInput,
  NotasFiscaisService,
} from './notas-fiscais.service';

const roles = [
  Role.admin,
  Role.gerente,
  Role.financeiro,
  Role.super_admin,
  Role.corretor,
  Role.treinee,
] as const;

@Controller('financeiro/notas-fiscais')
@UseGuards(RolesGuard, FinanceiroPermsGuard)
export class NotasFiscaisController {
  constructor(private readonly notas: NotasFiscaisService) {}

  @Get()
  @Roles(...roles)
  list(@CurrentUser() requester: AuthenticatedUser, @Query('q') q?: string) {
    return this.notas.list(requester, q);
  }

  @Post()
  @Roles(...roles)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: DOCUMENT_MAX_BYTES, files: 1 },
    }),
  )
  create(
    @CurrentUser() requester: AuthenticatedUser,
    @Body() body: NotaFiscalInput,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.notas.create(requester, body, file);
  }

  @Patch(':id')
  @Roles(...roles)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: DOCUMENT_MAX_BYTES, files: 1 },
    }),
  )
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() requester: AuthenticatedUser,
    @Body() body: NotaFiscalInput,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.notas.update(id, requester, body, file);
  }
}
