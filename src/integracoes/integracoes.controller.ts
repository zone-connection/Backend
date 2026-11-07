import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { IntegracaoGuard } from './integracao.guard';
import { IntegracoesService } from './integracoes.service';

@Public()
@Controller('integracoes')
export class IntegracoesController {
  constructor(private readonly service: IntegracoesService) {}

  @Get('imoveis')
  @UseGuards(IntegracaoGuard)
  imoveis(
    @Headers('x-tenant') tenant: string | undefined,
    @Query('finalidade') finalidade?: string,
    @Query('bairro') bairro?: string,
    @Query('cidade') cidade?: string,
    @Query('quartos') quartos?: string,
    @Query('banheiros') banheiros?: string,
    @Query('precoMin') precoMin?: string,
    @Query('precoMax') precoMax?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.service.tenantIdFrom(tenant).then((tenantId) =>
      this.service.listarImoveis(tenantId, {
        finalidade,
        bairro,
        cidade,
        quartos: num(quartos),
        banheiros: num(banheiros),
        precoMin: num(precoMin),
        precoMax: num(precoMax),
        page: num(page),
        pageSize: num(pageSize),
      }),
    );
  }

  @Get('funis')
  @UseGuards(IntegracaoGuard)
  funis(@Headers('x-tenant') tenant?: string) {
    return this.service.tenantIdFrom(tenant).then((tenantId) =>
      this.service.listarFunis(tenantId),
    );
  }

  @Get('leads')
  @UseGuards(IntegracaoGuard)
  leads(
    @Headers('x-tenant') tenant: string | undefined,
    @Query('desde') desde?: string,
    @Query('origem') origem?: string,
  ) {
    return this.service.tenantIdFrom(tenant).then((tenantId) =>
      this.service.listarLeads(tenantId, { desde, origem }),
    );
  }

  @Post('leads')
  @UseGuards(IntegracaoGuard)
  criar(
    @Headers('x-tenant') tenant: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    return this.service.tenantIdFrom(tenant).then((tenantId) =>
      this.service.criarLead(tenantId, body as never),
    );
  }

  @Patch('leads/:id')
  @UseGuards(IntegracaoGuard)
  atualizar(
    @Headers('x-tenant') tenant: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.service.tenantIdFrom(tenant).then((tenantId) =>
      this.service.atualizarLead(tenantId, id, body as never),
    );
  }

  @Post('leads/:id/etapa')
  @UseGuards(IntegracaoGuard)
  etapa(
    @Headers('x-tenant') tenant: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { etapaSlug?: string; funilId?: string },
  ) {
    return this.service.tenantIdFrom(tenant).then((tenantId) =>
      this.service.moverEtapa(tenantId, id, body),
    );
  }

  @Post('webhooks/chamada')
  chamada(
    @Headers('x-tenant') tenant: string | undefined,
    @Headers('x-webhook-secret') secret: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    this.service.assertWebhookSecret(secret);
    return this.service.tenantIdFrom(tenant).then((tenantId) =>
      this.service.receberChamada(tenantId, body as never),
    );
  }
}

function num(value?: string): number | undefined {
  if (value == null || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}
