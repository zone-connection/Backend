import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { ApiAppsService } from './api-apps.service';
import { WebhookDestinosService } from './webhooks/webhooks.service';

class CriarAplicacaoDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  nome!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  descricao?: string;

  @IsUUID()
  tenantId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  scopes!: string[];
}

class CriarWebhookAdminDto {
  @IsUrl({ require_protocol: true, protocols: ['https', 'http'] })
  url!: string;

  @IsArray()
  @IsString({ each: true })
  events!: string[];
}

class AtualizarWebhookAdminDto {
  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['https', 'http'] })
  url?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  events?: string[];

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

class ConcederDto {
  @IsUUID()
  tenantId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  scopes!: string[];
}

@Controller('v1/aplicacoes')
@UseGuards(RolesGuard)
@Roles(Role.super_admin)
export class ApiAppsController {
  constructor(
    private readonly apps: ApiAppsService,
    private readonly webhooks: WebhookDestinosService,
  ) {}

  @Get()
  listar(@CurrentUser() user: AuthenticatedUser) {
    this.onlySuperAdmin(user);
    return this.apps.listar();
  }

  @Post()
  criar(
    @Body() body: CriarAplicacaoDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.onlySuperAdmin(user);
    return this.apps.criar(body);
  }

  @Get(':id/webhooks')
  listarWebhooks(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.onlySuperAdmin(user);
    return this.apps.listar().then((apps) => {
      const app = apps.find((item) => item.id === id);
      if (!app) throw new NotFoundException('Aplicação não encontrada.');
      return app.webhooks;
    });
  }

  @Post(':id/webhooks')
  async criarWebhook(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CriarWebhookAdminDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.onlySuperAdmin(user);
    const alvo = await this.apps.tenantAtivo(id);
    return this.webhooks.criar(alvo.tenantId, alvo.aplicacaoId, body.url, body.events);
  }

  @Patch(':id/webhooks/:webhookId')
  async atualizarWebhook(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('webhookId', ParseUUIDPipe) webhookId: string,
    @Body() body: AtualizarWebhookAdminDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.onlySuperAdmin(user);
    const alvo = await this.apps.tenantAtivo(id);
    return this.webhooks.atualizar(alvo.tenantId, alvo.aplicacaoId, webhookId, body);
  }

  @Delete(':id/webhooks/:webhookId')
  async desativarWebhook(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('webhookId', ParseUUIDPipe) webhookId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.onlySuperAdmin(user);
    const alvo = await this.apps.tenantAtivo(id);
    return this.webhooks.desativar(alvo.tenantId, alvo.aplicacaoId, webhookId);
  }

  @Post(':id/webhooks/:webhookId/rotate-secret')
  async rotacionarWebhook(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('webhookId', ParseUUIDPipe) webhookId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.onlySuperAdmin(user);
    const alvo = await this.apps.tenantAtivo(id);
    return this.webhooks.rotacionar(alvo.tenantId, alvo.aplicacaoId, webhookId);
  }

  @Post(':id/rotacionar')
  rotacionar(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.onlySuperAdmin(user);
    return this.apps.rotacionar(id);
  }

  @Post(':id/revogar')
  revogar(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.onlySuperAdmin(user);
    return this.apps.revogarAplicacao(id);
  }

  @Post(':id/autorizacoes')
  conceder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ConcederDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.onlySuperAdmin(user);
    return this.apps.conceder({ aplicacaoId: id, ...body });
  }

  @Post('autorizacoes/:autorizacaoId/revogar')
  revogarAutorizacao(
    @Param('autorizacaoId', ParseUUIDPipe) autorizacaoId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.onlySuperAdmin(user);
    return this.apps.revogarAutorizacao(autorizacaoId);
  }

  private onlySuperAdmin(user: AuthenticatedUser) {
    if (user.role !== Role.super_admin) {
      throw new ForbiddenException('Apenas o super administrador gerencia aplicações.');
    }
  }
}
