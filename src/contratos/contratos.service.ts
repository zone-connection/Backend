import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { requireTenantId } from '../common/utils/tenant';
import { TenantLogoColorService } from '../tenants/tenant-logo-color.service';
import { GenerateContratoDto } from './dto/generate-contrato.dto';
import { buildChecklistRendaPdf } from './checklist-renda-pdf';

const VALUE_MAX = 500;
const NOTES_MAX = 2000;
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

@Injectable()
export class ContratosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logoColor: TenantLogoColorService,
  ) {}

  async generatePdf(dto: GenerateContratoDto, requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);
    const values = sanitizeValues(dto.values);
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
}

function sanitizeValues(raw: Record<string, string>) {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw ?? {})) {
    if (!ALLOWED_KEYS.has(key) || typeof value !== 'string') continue;
    const max = key === 'observacoes' ? NOTES_MAX : VALUE_MAX;
    out[key] = value.trim().slice(0, max);
  }
  return out;
}

function safeName(raw: string) {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w.-]+/g, '_')
    .slice(0, 40) || 'cliente';
}
