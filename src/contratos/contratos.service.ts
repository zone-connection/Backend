import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ContratoDocumentoStatus, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { requireTenantId } from '../common/utils/tenant';
import { TenantLogoColorService } from '../tenants/tenant-logo-color.service';
import {
  GenerateContratoDto,
  UpsertContratoDocumentoDto,
} from './dto/generate-contrato.dto';
import { buildChecklistRendaPdf } from './checklist-renda-pdf';

const VALUE_MAX = 500;
const NOTES_MAX = 2000;
const MAX_KEYS = 80;
const ALLOWED_KEYS = new Set([
  'nome',
  'cpf',
  'rendaSolicitada',
  'profissao',
  'rendaParcialExtratos',
  'bolsaFamilia',
  'bolsaFamiliaValor',
  'vinculoEmpregaticio',
  'empresa',
  'salarioContracheque',
  'docExtratos',
  'docContracheques',
  'docFgts',
  'docIdentidade',
  'docOutros',
  'docOutrosTexto',
  'observacoes',
  'cidade',
  'data',
]);

const KEY_RE = /^[a-zA-Z0-9_]{1,64}$/;

const documentoSelect = {
  id: true,
  templateId: true,
  titulo: true,
  values: true,
  status: true,
  baixadoAt: true,
  createdAt: true,
  updatedAt: true,
  autor: { select: { id: true, name: true } },
} as const;

@Injectable()
export class ContratosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logoColor: TenantLogoColorService,
  ) {}

  async listDocumentos(requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);
    return this.prisma.contratoDocumento.findMany({
      where: {
        tenantId,
        ...(this.veTodos(requester) ? {} : { autorId: requester.id }),
      },
      select: documentoSelect,
      orderBy: { updatedAt: 'desc' },
    });
  }

  async upsertDocumento(
    dto: UpsertContratoDocumentoDto,
    requester: AuthenticatedUser,
    id?: string,
  ) {
    const tenantId = requireTenantId(requester);
    const values = sanitizeAnyValues(dto.values);
    const titulo =
      dto.titulo?.trim() ||
      pickTitulo(values) ||
      'Contrato sem nome';
    const status =
      dto.status === 'baixado'
        ? ContratoDocumentoStatus.baixado
        : ContratoDocumentoStatus.rascunho;

    if (id) {
      const existing = await this.requireDocumento(id, requester);
      const nextStatus =
        dto.status != null ? status : existing.status;
      return this.prisma.contratoDocumento.update({
        where: { id: existing.id },
        data: {
          templateId: dto.templateId,
          titulo: titulo.slice(0, 160),
          values: values as Prisma.InputJsonValue,
          status: nextStatus,
          baixadoAt:
            nextStatus === ContratoDocumentoStatus.baixado
              ? (existing.baixadoAt ?? new Date())
              : existing.baixadoAt,
        },
        select: documentoSelect,
      });
    }

    return this.prisma.contratoDocumento.create({
      data: {
        tenantId,
        autorId: requester.id,
        templateId: dto.templateId,
        titulo: titulo.slice(0, 160),
        values: values as Prisma.InputJsonValue,
        status,
        baixadoAt:
          status === ContratoDocumentoStatus.baixado ? new Date() : null,
      },
      select: documentoSelect,
    });
  }

  async removeDocumento(id: string, requester: AuthenticatedUser) {
    const existing = await this.requireDocumento(id, requester);
    await this.prisma.contratoDocumento.delete({ where: { id: existing.id } });
    return { ok: true as const };
  }

  async generatePdf(dto: GenerateContratoDto, requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);
    const values = sanitizeChecklistValues(dto.values);
    if (!values.nome || !values.cpf) {
      throw new BadRequestException('Informe o nome e o CPF do cliente.');
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        name: true,
        cidade: true,
        logoUrl: true,
        primaryColor: true,
      },
    });
    if (!tenant) {
      throw new BadRequestException('Imobiliária não encontrada.');
    }

    if (!values.cidade && tenant.cidade?.trim()) {
      values.cidade = tenant.cidade.trim();
    }

    const logo = await this.logoColor.loadLogoForPdf(tenant.logoUrl);
    const brandHex =
      tenant.primaryColor?.trim() || logo?.primaryColor || '#079ED4';

    const buffer = await buildChecklistRendaPdf({
      values,
      brandHex,
      logo,
      tenantName: tenant.name,
    });

    return {
      buffer,
      filename: `checklist-renda-${safeName(values.nome)}.pdf`,
    };
  }

  private veTodos(requester: AuthenticatedUser) {
    return (
      requester.role === Role.admin ||
      requester.role === Role.gerente ||
      requester.role === Role.super_admin
    );
  }

  private async requireDocumento(id: string, requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);
    const item = await this.prisma.contratoDocumento.findFirst({
      where: { id, tenantId },
    });
    if (!item) {
      throw new NotFoundException('Contrato não encontrado.');
    }
    if (!this.veTodos(requester) && item.autorId !== requester.id) {
      throw new ForbiddenException('Você não pode alterar este contrato.');
    }
    return item;
  }
}

function sanitizeChecklistValues(raw: Record<string, string>) {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw ?? {})) {
    if (!ALLOWED_KEYS.has(key) || typeof value !== 'string') continue;
    const max = key === 'observacoes' ? NOTES_MAX : VALUE_MAX;
    out[key] = value.trim().slice(0, max);
  }
  return out;
}

function sanitizeAnyValues(raw: Record<string, string>) {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw ?? {})) {
    if (!KEY_RE.test(key) || typeof value !== 'string') continue;
    if (Object.keys(out).length >= MAX_KEYS) break;
    const max = key === 'observacoes' ? NOTES_MAX : VALUE_MAX;
    out[key] = value.trim().slice(0, max);
  }
  return out;
}

function pickTitulo(values: Record<string, string>) {
  return (
    values.nome?.trim() ||
    values.contratanteNome?.trim() ||
    values.clienteNome?.trim() ||
    values.compradorNome?.trim() ||
    ''
  );
}

function safeName(raw: string) {
  return (
    raw
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w.-]+/g, '_')
      .slice(0, 40) || 'cliente'
  );
}
