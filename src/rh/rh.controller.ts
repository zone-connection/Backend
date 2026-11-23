import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { RhEtapa, RhModeloTipo, Role } from '@prisma/client';
import type { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import {
  ConverterCandidatoDto,
  CreateCandidatoDto,
  CreateCompromissoDto,
  CreateTreinamentoDto,
  DesligarDto,
  MoverCandidatoDto,
  UpdateCandidatoDto,
} from './dto/rh.dto';
import { RhService } from './rh.service';

@Controller('rh')
@UseGuards(RolesGuard)
@Roles(Role.admin, Role.rh)
export class RhController {
  constructor(private readonly rh: RhService) {}

  @Get('painel')
  painel(
    @CurrentUser() user: AuthenticatedUser,
    @Query('de') de?: string,
    @Query('ate') ate?: string,
  ) {
    return this.rh.painel(user, de, ate);
  }

  @Get('candidatos')
  candidatos(
    @CurrentUser() user: AuthenticatedUser,
    @Query('etapa') etapa?: RhEtapa,
  ) {
    return this.rh.listCandidatos(user, etapa);
  }

  @Get('candidatos/:id')
  candidato(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.rh.candidato(user, id);
  }

  @Post('candidatos')
  criar(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCandidatoDto,
  ) {
    return this.rh.criarCandidato(user, dto);
  }

  @Patch('candidatos/:id')
  atualizar(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCandidatoDto,
  ) {
    return this.rh.atualizarCandidato(user, id, dto);
  }

  @Post('candidatos/:id/mover')
  mover(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MoverCandidatoDto,
  ) {
    return this.rh.mover(user, id, dto);
  }

  @Post('candidatos/:id/converter')
  converter(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConverterCandidatoDto,
  ) {
    return this.rh.converter(user, id, dto);
  }

  @Get('equipe')
  equipe(
    @CurrentUser() user: AuthenticatedUser,
    @Query('situacao') situacao?: string,
  ) {
    return this.rh.equipe(user, situacao);
  }

  @Get('equipe/:id')
  ficha(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.rh.ficha(user, id);
  }

  @Post('equipe/:id/desligar')
  desligar(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DesligarDto,
  ) {
    return this.rh.desligar(user, id, dto);
  }

  @Get('encerrados')
  encerrados(@CurrentUser() user: AuthenticatedUser) {
    return this.rh.encerrados(user);
  }

  @Post('treinamentos')
  treinamento(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateTreinamentoDto,
  ) {
    return this.rh.criarTreinamento(user, dto);
  }

  @Get('agenda')
  agenda(@CurrentUser() user: AuthenticatedUser) {
    return this.rh.agenda(user);
  }

  @Post('agenda')
  compromisso(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCompromissoDto,
  ) {
    return this.rh.criarCompromisso(user, dto);
  }

  @Post('documentos')
  @UseInterceptors(FileInterceptor('arquivo', { limits: { fileSize: 8 * 1024 * 1024 } }))
  documento(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() arquivo: Express.Multer.File,
    @Body('nome') nome: string,
    @Body('candidatoId') candidatoId?: string,
    @Body('userId') userId?: string,
  ) {
    return this.rh.uploadDocumento(user, arquivo, nome ?? '', candidatoId, userId);
  }

  @Get('documentos/:id')
  async baixarDocumento(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const doc = await this.rh.baixarDocumento(user, id);
    res.setHeader('Content-Type', doc.mime);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(doc.nomeArquivo)}"`,
    );
    res.send(Buffer.from(doc.conteudo));
  }

  @Get('modelos')
  modelos(@CurrentUser() user: AuthenticatedUser) {
    return this.rh.listModelos(user);
  }

  @Post('modelos')
  @UseInterceptors(FileInterceptor('arquivo', { limits: { fileSize: 8 * 1024 * 1024 } }))
  modelo(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() arquivo: Express.Multer.File,
    @Body('nome') nome: string,
    @Body('tipo') tipo: RhModeloTipo,
  ) {
    return this.rh.uploadModelo(user, arquivo, tipo, nome ?? '');
  }

  @Get('modelos/:id')
  async baixarModelo(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const doc = await this.rh.baixarModelo(user, id);
    res.setHeader('Content-Type', doc.mime);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(doc.nomeArquivo)}"`,
    );
    res.send(Buffer.from(doc.conteudo));
  }
}
