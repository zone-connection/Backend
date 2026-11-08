import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { IsString, MaxLength } from 'class-validator';
import { Public } from '../common/decorators/public.decorator';
import { ApiAccessGuard } from './api-access.guard';
import { ApiAuditInterceptor } from './api-audit.interceptor';
import { ApiScopes, type ApiRequestContext } from './api-context';
import { ApiLeadsService } from './api-leads.service';
import { ApiTenant } from './api-tenant.decorator';
import { CriarLeadApiDto } from './dto/criar-lead-api.dto';
import { AtualizarLeadApiDto } from './dto/atualizar-lead-api.dto';
import { ListarLeadsApiDto } from './dto/listar-leads-api.dto';
import { MoverLeadApiDto } from './dto/mover-lead-api.dto';

class ImportarCsvApiDto {
  @IsString()
  @MaxLength(1_500_000)
  csv!: string;
}

export const MODELO_CSV_BASE_FRIA = [
  'nome,telefone,email,cidade,bairro,interesse,origem,prioridade,categoria',
  'Ana Souza,(81) 98888-7777,ana@email.com,Recife,Boa Viagem,Comprar,base-fria,Média,potencial',
].join('\n');

@Public()
@UseInterceptors(ApiAuditInterceptor)
@UseGuards(ApiAccessGuard)
@Controller('v1/leads')
export class ApiLeadsController {
  constructor(private readonly leads: ApiLeadsService) {}

  @Post()
  @ApiScopes('leads:write')
  criar(@ApiTenant() api: ApiRequestContext, @Body() body: CriarLeadApiDto) {
    return this.leads.criar(api.tenantId, body);
  }

  @Get()
  @ApiScopes('leads:read')
  listar(@ApiTenant() api: ApiRequestContext, @Query() query: ListarLeadsApiDto) {
    return this.leads.listar(api.tenantId, query);
  }

  @Get('import/modelo')
  @ApiScopes('leads:write')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  modelo() {
    return MODELO_CSV_BASE_FRIA;
  }

  @Post('import')
  @ApiScopes('leads:write')
  importar(@ApiTenant() api: ApiRequestContext, @Body() body: ImportarCsvApiDto) {
    return this.leads.importarCsv(api.tenantId, body.csv);
  }

  @Get(':id')
  @ApiScopes('leads:read')
  detalhe(
    @ApiTenant() api: ApiRequestContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.leads.detalhe(api.tenantId, id);
  }

  @Patch(':id')
  @ApiScopes('leads:update')
  atualizar(
    @ApiTenant() api: ApiRequestContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AtualizarLeadApiDto,
  ) {
    return this.leads.atualizar(api.tenantId, id, body);
  }

  @Post(':id/move')
  @ApiScopes('leads:update')
  mover(
    @ApiTenant() api: ApiRequestContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: MoverLeadApiDto,
  ) {
    return this.leads.mover(api.tenantId, id, body.stage);
  }
}
