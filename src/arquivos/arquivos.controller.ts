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
  Query,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { ArquivoCategoria, ArquivoVinculoTipo } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { ArquivosService } from './arquivos.service';
import { pdfUploadInterceptor } from './arquivos.constants';
import { QueryArquivosDto } from './dto/query-arquivos.dto';
import {
  CreateDocumentoTagDto,
  UpdateDocumentoTagDto,
} from './dto/create-tag.dto';
import { UpdateArquivoDto } from './dto/update-arquivo.dto';
import { ShareArquivosDto, ZipArquivosDto } from './dto/share-arquivos.dto';

@Controller('arquivos')
export class ArquivosController {
  constructor(private readonly arquivos: ArquivosService) {}

  @Public()
  @Get('share/:token')
  @Header('Cache-Control', 'no-store')
  async shareDownloadEarly(@Param('token') token: string) {
    const file = await this.arquivos.downloadShare(token);
    return new StreamableFile(file.buffer, {
      type: file.kind === 'pdf' ? 'application/pdf' : 'application/zip',
      disposition: `attachment; filename="${file.filename}"`,
    });
  }

  @Get('tags')
  listTags(
    @CurrentUser() user: AuthenticatedUser,
    @Query('q') q?: string,
    @Query('all') all?: string,
  ) {
    return this.arquivos.listTags(user, q, all === '1' || all === 'true');
  }

  @Post('tags')
  @UseGuards(RolesGuard)
  @Roles(Role.admin, Role.gerente, Role.super_admin)
  createTag(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateDocumentoTagDto,
  ) {
    return this.arquivos.createTag(user, dto.nome);
  }

  @Patch('tags/:id')
  @UseGuards(RolesGuard)
  @Roles(Role.admin, Role.gerente, Role.super_admin)
  updateTag(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDocumentoTagDto,
  ) {
    return this.arquivos.updateTag(user, id, dto);
  }

  @Get('historico')
  historico(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryArquivosDto,
  ) {
    return this.arquivos.listHistorico(user, query.entityType, query.entityId);
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: QueryArquivosDto) {
    return this.arquivos.list(
      user,
      query.entityType,
      query.entityId,
      query.categoria,
    );
  }

  @Post('upload')
  @UseInterceptors(pdfUploadInterceptor())
  upload(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File,
    @Body('entityType') entityType: ArquivoVinculoTipo,
    @Body('entityId') entityId: string,
    @Body('nome') nome: string,
    @Body('categoria') categoria: ArquivoCategoria,
    @Body('tagIds') tagIdsRaw: string,
    @Body('extraEntityType') extraEntityType?: ArquivoVinculoTipo,
    @Body('extraEntityId') extraEntityId?: string,
  ) {
    let tagIds: string[] = [];
    try {
      const parsed = JSON.parse(tagIdsRaw || '[]');
      if (Array.isArray(parsed)) tagIds = parsed.map(String);
    } catch {
      tagIds = String(tagIdsRaw || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return this.arquivos.upload({
      user,
      file,
      entityType,
      entityId,
      nomeExibicao: nome,
      categoria: categoria || ArquivoCategoria.outro,
      tagIds,
      extraVinculos:
        extraEntityType && extraEntityId
          ? [{ entityType: extraEntityType, entityId: extraEntityId }]
          : undefined,
    });
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateArquivoDto,
  ) {
    return this.arquivos.update(user, id, dto);
  }

  @Delete(':id')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('entityType') entityType: ArquivoVinculoTipo,
    @Query('entityId') entityId: string,
  ) {
    return this.arquivos.remove(user, id, entityType, entityId);
  }

  @Get(':id/download')
  async download(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const { buffer, filename, mime } = await this.arquivos.download(user, id);
    return new StreamableFile(buffer, {
      type: mime || 'application/pdf',
      disposition: `attachment; filename="${filename}"`,
    });
  }

  @Get(':id/preview')
  preview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.arquivos.previewUrl(user, id);
  }

  @Post('zip')
  @UseGuards(RolesGuard)
  @Roles(Role.admin, Role.gerente, Role.super_admin)
  async zip(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ZipArquivosDto,
  ) {
    const { stream, filename } = await this.arquivos.zipStream(
      user,
      dto.entityType,
      dto.entityId,
      dto.ids,
    );
    return new StreamableFile(stream, {
      type: 'application/zip',
      disposition: `attachment; filename="${filename}"`,
    });
  }

  @Post('share')
  @UseGuards(RolesGuard)
  @Roles(Role.admin, Role.gerente, Role.super_admin)
  share(@CurrentUser() user: AuthenticatedUser, @Body() dto: ShareArquivosDto) {
    return this.arquivos.shareEmail(user, dto);
  }

}
