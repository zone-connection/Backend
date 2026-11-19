import { Body, Controller, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import { IsArray, IsISO8601, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { Public } from '../common/decorators/public.decorator';
import { IntegracoesService } from '../integracoes/integracoes.service';
import { ApiAccessGuard } from './api-access.guard';
import { ApiAuditInterceptor } from './api-audit.interceptor';
import { ApiScopes, type ApiRequestContext } from './api-context';
import { ApiTenant } from './api-tenant.decorator';

class ChamadaApiDto {
  @IsString()
  @MaxLength(120)
  externalId!: string;

  @IsOptional()
  @IsUUID()
  leadId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  telefone?: string;

  @IsOptional()
  @IsISO8601()
  inicioEm?: string;

  @IsOptional()
  @IsISO8601()
  fimEm?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  resultado?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  transcricao?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  resumo?: string;

  @IsOptional()
  @IsUUID()
  funilId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  etapaSlug?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  imoveisOfertados?: string[];
}

@Public()
@UseInterceptors(ApiAuditInterceptor)
@UseGuards(ApiAccessGuard)
@Controller('v1/calls')
export class ApiCallsController {
  constructor(private readonly integracoes: IntegracoesService) {}

  @Post()
  @ApiScopes('calls:write')
  receber(@ApiTenant() api: ApiRequestContext, @Body() body: ChamadaApiDto) {
    return this.integracoes.receberChamada(api.tenantId, body);
  }
}
