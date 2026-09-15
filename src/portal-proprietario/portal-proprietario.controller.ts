import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { imageUploadInterceptor } from '../media/media.constants';
import { Public } from '../common/decorators/public.decorator';
import { CurrentPortal } from './decorators/current-portal.decorator';
import {
  ChangePortalPasswordDto,
  PortalAcaoDto,
} from './dto/portal-auth.dto';
import {
  CreatePortalImovelDto,
  UpdatePortalImovelDto,
} from './dto/portal-imovel.dto';
import { PortalProprietarioAuthGuard } from './guards/portal-proprietario-auth.guard';
import { PortalProprietarioAuthService } from './portal-proprietario-auth.service';
import { PortalProprietarioImoveisService } from './portal-proprietario-imoveis.service';
import type { PortalProprietarioSession } from './portal-proprietario.types';

@Public()
@UseGuards(PortalProprietarioAuthGuard)
@Controller('portal-proprietario')
export class PortalProprietarioController {
  constructor(
    private readonly auth: PortalProprietarioAuthService,
    private readonly imoveis: PortalProprietarioImoveisService,
  ) {}

  @Get('me')
  me(@CurrentPortal() session: PortalProprietarioSession) {
    return this.auth.me(session);
  }

  @Patch('me/senha')
  @HttpCode(204)
  changePassword(
    @CurrentPortal() session: PortalProprietarioSession,
    @Body() dto: ChangePortalPasswordDto,
  ) {
    return this.auth.changePassword(session, dto.senhaAtual, dto.senhaNova);
  }

  @Get('imoveis')
  list(@CurrentPortal() session: PortalProprietarioSession) {
    return this.imoveis.dashboard(session);
  }

  @Post('imoveis')
  create(
    @Body() dto: CreatePortalImovelDto,
    @CurrentPortal() session: PortalProprietarioSession,
  ) {
    return this.imoveis.createSugestao(session, dto);
  }

  @Get('novidades')
  novidades(@CurrentPortal() session: PortalProprietarioSession) {
    return this.imoveis.listNovidades(session);
  }

  @Post('novidades/lidas')
  marcarNovidadesLidas(@CurrentPortal() session: PortalProprietarioSession) {
    return this.imoveis.marcarNovidadesLidas(session);
  }

  @Patch('imoveis/:id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePortalImovelDto,
    @CurrentPortal() session: PortalProprietarioSession,
  ) {
    return this.imoveis.updateImovel(id, session, dto);
  }

  @Post('imoveis/:id/fotos')
  @UseInterceptors(imageUploadInterceptor())
  uploadFoto(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentPortal() session: PortalProprietarioSession,
  ) {
    return this.imoveis.uploadFoto(id, session, file);
  }

  @Delete('imoveis/:id/fotos/:fotoId')
  removeFoto(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('fotoId', ParseUUIDPipe) fotoId: string,
    @CurrentPortal() session: PortalProprietarioSession,
  ) {
    return this.imoveis.removeFoto(id, session, fotoId);
  }

  @Post('imoveis/:id/cancelar-captacao')
  cancelarCaptacao(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPortal() session: PortalProprietarioSession,
  ) {
    return this.imoveis.cancelarCaptacao(id, session);
  }

  @Get('imoveis/:id')
  get(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPortal() session: PortalProprietarioSession,
  ) {
    return this.imoveis.getImovel(id, session);
  }

  @Post('imoveis/:id/acoes')
  registrarAcao(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PortalAcaoDto,
    @CurrentPortal() session: PortalProprietarioSession,
  ) {
    return this.imoveis.registrarAcao(id, session, dto.tipo);
  }

  @Get('imoveis/:id/historico')
  historico(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPortal() session: PortalProprietarioSession,
  ) {
    return this.imoveis.getHistorico(id, session);
  }

  @Get('imoveis/:id/visitas')
  visitas(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPortal() session: PortalProprietarioSession,
  ) {
    return this.imoveis.getVisitas(id, session);
  }

  @Get('imoveis/:id/propostas')
  propostas(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPortal() session: PortalProprietarioSession,
  ) {
    return this.imoveis.getPropostas(id, session);
  }

  @Get('imoveis/:id/fechamento')
  fechamento(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPortal() session: PortalProprietarioSession,
  ) {
    return this.imoveis.getFechamento(id, session);
  }

  @Get('imoveis/:id/documentacao')
  documentacao(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPortal() session: PortalProprietarioSession,
  ) {
    return this.imoveis.getDocumentacao(id, session);
  }

  @Get('imoveis/:id/contrato')
  contrato(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPortal() session: PortalProprietarioSession,
  ) {
    return this.imoveis.getContrato(id, session);
  }

  @Get('imoveis/:id/chaves')
  chaves(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPortal() session: PortalProprietarioSession,
  ) {
    return this.imoveis.getChaves(id, session);
  }

  @Get('imoveis/:id/pos-venda')
  posVenda(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPortal() session: PortalProprietarioSession,
  ) {
    return this.imoveis.getPosVenda(id, session);
  }
}
