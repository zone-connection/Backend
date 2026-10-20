import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { CreateTreinamentoSecaoDto } from './dto/create-secao.dto';
import { UpdateTreinamentoSecaoDto } from './dto/update-secao.dto';
import { CreateTreinamentoLinkDto } from './dto/create-link.dto';
import { UpdateTreinamentoLinkDto } from './dto/update-link.dto';
import { TreinamentoService } from './treinamento.service';

@Controller('treinamento')
@UseGuards(RolesGuard)
export class TreinamentoController {
  constructor(private readonly treinamento: TreinamentoService) {}

  @Get()
  @Roles(
    Role.super_admin,
    Role.admin,
    Role.gerente,
    Role.corretor,
    Role.analista,
    Role.treinee,
  )
  tree(@CurrentUser() requester: AuthenticatedUser) {
    return this.treinamento.tree(requester);
  }

  @Post('secoes')
  @Roles(
    Role.super_admin,
    Role.admin,
    Role.gerente,
    Role.analista,
    Role.treinee,
  )
  createSecao(
    @Body() dto: CreateTreinamentoSecaoDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.treinamento.createSecao(dto, requester);
  }

  @Patch('secoes/:id')
  @Roles(
    Role.super_admin,
    Role.admin,
    Role.gerente,
    Role.analista,
    Role.treinee,
  )
  updateSecao(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTreinamentoSecaoDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.treinamento.updateSecao(id, dto, requester);
  }

  @Delete('secoes/:id')
  @Roles(
    Role.super_admin,
    Role.admin,
    Role.gerente,
    Role.analista,
    Role.treinee,
  )
  removeSecao(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.treinamento.removeSecao(id, requester);
  }

  @Post('links/upload')
  @Roles(
    Role.super_admin,
    Role.admin,
    Role.gerente,
    Role.analista,
    Role.treinee,
  )
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 40 * 1024 * 1024, files: 1 },
    }),
  )
  uploadLink(
    @UploadedFile() file: Express.Multer.File,
    @Body('secaoId') secaoId: string,
    @Body('titulo') titulo: string | undefined,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    if (!secaoId?.trim()) {
      throw new BadRequestException('Informe a seção.');
    }
    return this.treinamento.uploadLink(file, secaoId.trim(), titulo, requester);
  }

  @Post('links')
  @Roles(
    Role.super_admin,
    Role.admin,
    Role.gerente,
    Role.analista,
    Role.treinee,
  )
  createLink(
    @Body() dto: CreateTreinamentoLinkDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.treinamento.createLink(dto, requester);
  }

  @Patch('links/:id')
  @Roles(
    Role.super_admin,
    Role.admin,
    Role.gerente,
    Role.analista,
    Role.treinee,
  )
  updateLink(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTreinamentoLinkDto,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.treinamento.updateLink(id, dto, requester);
  }

  @Delete('links/:id')
  @Roles(
    Role.super_admin,
    Role.admin,
    Role.gerente,
    Role.analista,
    Role.treinee,
  )
  removeLink(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() requester: AuthenticatedUser,
  ) {
    return this.treinamento.removeLink(id, requester);
  }
}
