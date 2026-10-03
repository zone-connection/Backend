import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { ImoveisUsadosService } from './imoveis-usados.service';
import { VendaUsadoFluxoService } from './venda-usado-fluxo.service';
import { VendaUsadoFechamentoService } from './venda-usado-fechamento.service';
import { ImovelChaveService } from './imovel-chave.service';
import { VendaUsadoPosVendaService } from './venda-usado-pos-venda.service';
import { IMOVEIS_USADOS_ROLES } from './imoveis-usados.roles';
import {
  CreateVendaUsadoDto,
  QueryVendasUsadoDto,
  UpdateVendaUsadoDto,
  UpdateVinculoDto,
  VincularInteressadoDto,
} from './dto/imoveis-usados.dto';
import { UpdateImovelDto } from '../captacao/dto/imovel.dto';
import {
  CreateNegociacaoMovimentoDto,
  CreatePropostaUsadoDto,
  CreateVisitaUsadoDto,
  FeedbackVisitaUsadoDto,
  UpdatePropostaUsadoDto,
  UpdateVisitaUsadoDto,
} from './dto/venda-usado-fluxo.dto';
import {
  CreateContratoUsadoDto,
  CreateDocumentoUsadoDto,
  CreateFechamentoUsadoDto,
  UpdateContratoUsadoDto,
  UpdateDocumentoUsadoDto,
  UpdateFechamentoUsadoDto,
} from './dto/venda-usado-fechamento.dto';
import {
  CreateImovelChaveDto,
  CreatePosVendaDto,
  CreatePosVendaPendenciaDto,
  MovimentarChaveDto,
  UpdateImovelChaveDto,
  UpdatePosVendaDto,
  UpdatePosVendaPendenciaDto,
} from './dto/venda-usado-pos.dto';

@Controller('imoveis-usados')
@UseGuards(RolesGuard)
export class ImoveisUsadosController {
  constructor(
    private readonly service: ImoveisUsadosService,
    private readonly fluxo: VendaUsadoFluxoService,
    private readonly fechamento: VendaUsadoFechamentoService,
    private readonly chaves: ImovelChaveService,
    private readonly posVenda: VendaUsadoPosVendaService,
  ) {}

  @Get('resumo')
  @Roles(...IMOVEIS_USADOS_ROLES)
  resumo(@CurrentUser() user: AuthenticatedUser) {
    return this.service.resumo(user);
  }

  @Get('responsaveis')
  @Roles(...IMOVEIS_USADOS_ROLES)
  responsaveis(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listResponsaveis(user);
  }

  @Get('imoveis-captados')
  @Roles(...IMOVEIS_USADOS_ROLES)
  captados(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listImoveisCaptados(user);
  }

  @Get()
  @Roles(...IMOVEIS_USADOS_ROLES)
  list(
    @Query() query: QueryVendasUsadoDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.list(query, user);
  }

  @Get(':id/matching')
  @Roles(...IMOVEIS_USADOS_ROLES)
  matching(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.matching(id, user);
  }

  @Get(':id/interessados')
  @Roles(...IMOVEIS_USADOS_ROLES)
  interessados(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.listVinculos(id, user);
  }

  @Get(':id')
  @Roles(...IMOVEIS_USADOS_ROLES)
  get(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.get(id, user);
  }

  @Post()
  @Roles(...IMOVEIS_USADOS_ROLES)
  create(
    @Body() dto: CreateVendaUsadoDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.create(dto, user);
  }

  @Patch(':id/imovel')
  @Roles(...IMOVEIS_USADOS_ROLES)
  updateImovel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateImovelDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.updateImovelFicha(id, dto, user);
  }

  @Patch(':id')
  @Roles(...IMOVEIS_USADOS_ROLES)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVendaUsadoDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.update(id, dto, user);
  }

  @Post(':id/interessados')
  @Roles(...IMOVEIS_USADOS_ROLES)
  vincular(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VincularInteressadoDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.vincular(id, dto, user);
  }

  @Patch(':id/interessados/:vinculoId')
  @Roles(...IMOVEIS_USADOS_ROLES)
  atualizarVinculo(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('vinculoId', ParseUUIDPipe) vinculoId: string,
    @Body() dto: UpdateVinculoDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.atualizarVinculo(id, vinculoId, dto, user);
  }

  @Delete(':id/interessados/:vinculoId')
  @Roles(...IMOVEIS_USADOS_ROLES)
  removerVinculo(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('vinculoId', ParseUUIDPipe) vinculoId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.removerVinculo(id, vinculoId, user);
  }

  @Get(':id/visitas')
  @Roles(...IMOVEIS_USADOS_ROLES)
  listVisitas(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.fluxo.listVisitas(id, user);
  }

  @Post(':id/visitas')
  @Roles(...IMOVEIS_USADOS_ROLES)
  createVisita(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateVisitaUsadoDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.fluxo.createVisita(id, dto, user);
  }

  @Patch(':id/visitas/:visitaId')
  @Roles(...IMOVEIS_USADOS_ROLES)
  updateVisita(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('visitaId', ParseUUIDPipe) visitaId: string,
    @Body() dto: UpdateVisitaUsadoDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.fluxo.updateVisita(id, visitaId, dto, user);
  }

  @Post(':id/visitas/:visitaId/feedback')
  @Roles(...IMOVEIS_USADOS_ROLES)
  feedbackVisita(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('visitaId', ParseUUIDPipe) visitaId: string,
    @Body() dto: FeedbackVisitaUsadoDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.fluxo.feedbackVisita(id, visitaId, dto, user);
  }

  @Get(':id/propostas')
  @Roles(...IMOVEIS_USADOS_ROLES)
  listPropostas(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.fluxo.listPropostas(id, user);
  }

  @Post(':id/propostas')
  @Roles(...IMOVEIS_USADOS_ROLES)
  createProposta(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreatePropostaUsadoDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.fluxo.createProposta(id, dto, user);
  }

  @Get(':id/propostas/:propostaId')
  @Roles(...IMOVEIS_USADOS_ROLES)
  getProposta(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('propostaId', ParseUUIDPipe) propostaId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.fluxo.getProposta(id, propostaId, user);
  }

  @Patch(':id/propostas/:propostaId')
  @Roles(...IMOVEIS_USADOS_ROLES)
  updateProposta(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('propostaId', ParseUUIDPipe) propostaId: string,
    @Body() dto: UpdatePropostaUsadoDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.fluxo.updateProposta(id, propostaId, dto, user);
  }

  @Get(':id/propostas/:propostaId/negociacao')
  @Roles(...IMOVEIS_USADOS_ROLES)
  getNegociacao(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('propostaId', ParseUUIDPipe) propostaId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.fluxo.getProposta(id, propostaId, user).then((p) => p.negociacao);
  }

  @Post(':id/propostas/:propostaId/negociacao')
  @Roles(...IMOVEIS_USADOS_ROLES)
  addMovimento(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('propostaId', ParseUUIDPipe) propostaId: string,
    @Body() dto: CreateNegociacaoMovimentoDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.fluxo.addMovimento(id, propostaId, dto, user);
  }

  @Get(':id/fechamento')
  @Roles(...IMOVEIS_USADOS_ROLES)
  getFechamento(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.fechamento.get(id, user);
  }

  @Post(':id/fechamento')
  @Roles(...IMOVEIS_USADOS_ROLES)
  iniciarFechamento(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateFechamentoUsadoDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.fechamento.iniciar(id, dto, user);
  }

  @Patch(':id/fechamento')
  @Roles(...IMOVEIS_USADOS_ROLES)
  updateFechamento(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFechamentoUsadoDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.fechamento.update(id, dto, user);
  }

  @Post(':id/fechamento/concluir')
  @Roles(...IMOVEIS_USADOS_ROLES)
  concluirFechamento(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.fechamento.concluir(id, user);
  }

  @Get(':id/fechamento/documentos')
  @Roles(...IMOVEIS_USADOS_ROLES)
  listDocumentos(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.fechamento.listDocumentos(id, user);
  }

  @Post(':id/fechamento/documentos')
  @Roles(...IMOVEIS_USADOS_ROLES)
  createDocumento(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateDocumentoUsadoDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.fechamento.createDocumento(id, dto, user);
  }

  @Patch(':id/fechamento/documentos/:documentoId')
  @Roles(...IMOVEIS_USADOS_ROLES)
  updateDocumento(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('documentoId', ParseUUIDPipe) documentoId: string,
    @Body() dto: UpdateDocumentoUsadoDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.fechamento.updateDocumento(id, documentoId, dto, user);
  }

  @Get(':id/fechamento/contrato')
  @Roles(...IMOVEIS_USADOS_ROLES)
  getContrato(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.fechamento.getContrato(id, user);
  }

  @Post(':id/fechamento/contrato')
  @Roles(...IMOVEIS_USADOS_ROLES)
  createContrato(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateContratoUsadoDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.fechamento.createContrato(id, dto, user);
  }

  @Patch(':id/fechamento/contrato')
  @Roles(...IMOVEIS_USADOS_ROLES)
  updateContrato(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateContratoUsadoDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.fechamento.updateContrato(id, dto, user);
  }

  @Get(':id/chaves')
  @Roles(...IMOVEIS_USADOS_ROLES)
  listChaves(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.chaves.list(id, user);
  }

  @Post(':id/chaves')
  @Roles(...IMOVEIS_USADOS_ROLES)
  createChave(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateImovelChaveDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.chaves.create(id, dto, user);
  }

  @Patch(':id/chaves/:chaveId')
  @Roles(...IMOVEIS_USADOS_ROLES)
  updateChave(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('chaveId', ParseUUIDPipe) chaveId: string,
    @Body() dto: UpdateImovelChaveDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.chaves.update(id, chaveId, dto, user);
  }

  @Post(':id/chaves/:chaveId/retirar')
  @Roles(...IMOVEIS_USADOS_ROLES)
  retirarChave(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('chaveId', ParseUUIDPipe) chaveId: string,
    @Body() dto: MovimentarChaveDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.chaves.retirar(id, chaveId, dto, user);
  }

  @Post(':id/chaves/:chaveId/devolver')
  @Roles(...IMOVEIS_USADOS_ROLES)
  devolverChave(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('chaveId', ParseUUIDPipe) chaveId: string,
    @Body() dto: MovimentarChaveDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.chaves.devolver(id, chaveId, dto, user);
  }

  @Post(':id/chaves/:chaveId/perder')
  @Roles(...IMOVEIS_USADOS_ROLES)
  perderChave(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('chaveId', ParseUUIDPipe) chaveId: string,
    @Body() dto: MovimentarChaveDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.chaves.perder(id, chaveId, dto, user);
  }

  @Post(':id/chaves/:chaveId/entregar-comprador')
  @Roles(...IMOVEIS_USADOS_ROLES)
  entregarChave(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('chaveId', ParseUUIDPipe) chaveId: string,
    @Body() dto: MovimentarChaveDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.chaves.entregarComprador(id, chaveId, dto, user);
  }

  @Get(':id/chaves/:chaveId/historico')
  @Roles(...IMOVEIS_USADOS_ROLES)
  historicoChave(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('chaveId', ParseUUIDPipe) chaveId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.chaves.historico(id, chaveId, user);
  }

  @Get(':id/pos-venda')
  @Roles(...IMOVEIS_USADOS_ROLES)
  getPosVenda(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.posVenda.get(id, user);
  }

  @Post(':id/pos-venda')
  @Roles(...IMOVEIS_USADOS_ROLES)
  iniciarPosVenda(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreatePosVendaDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.posVenda.iniciar(id, dto, user);
  }

  @Patch(':id/pos-venda')
  @Roles(...IMOVEIS_USADOS_ROLES)
  updatePosVenda(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePosVendaDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.posVenda.update(id, dto, user);
  }

  @Post(':id/pos-venda/concluir')
  @Roles(...IMOVEIS_USADOS_ROLES)
  concluirPosVenda(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.posVenda.concluir(id, user);
  }

  @Get(':id/pos-venda/pendencias')
  @Roles(...IMOVEIS_USADOS_ROLES)
  listPendencias(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.posVenda.listPendencias(id, user);
  }

  @Post(':id/pos-venda/pendencias')
  @Roles(...IMOVEIS_USADOS_ROLES)
  createPendencia(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreatePosVendaPendenciaDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.posVenda.createPendencia(id, dto, user);
  }

  @Patch(':id/pos-venda/pendencias/:pendenciaId')
  @Roles(...IMOVEIS_USADOS_ROLES)
  updatePendencia(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('pendenciaId', ParseUUIDPipe) pendenciaId: string,
    @Body() dto: UpdatePosVendaPendenciaDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.posVenda.updatePendencia(id, pendenciaId, dto, user);
  }
}
