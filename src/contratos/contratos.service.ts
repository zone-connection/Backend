import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ContratoDocumentoStatus, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { requireTenantId } from '../common/utils/tenant';
import { MediaService } from '../media/media.service';
import { TenantLogoColorService } from '../tenants/tenant-logo-color.service';
import {
  GenerateContratoDto,
  UpsertContratoDocumentoDto,
} from './dto/generate-contrato.dto';
import { buildChecklistRendaPdf } from './checklist-renda-pdf';
import { extractIntermediacaoFields } from './intermediacao-extract';
import {
  INTERMEDIACAO_KEYS,
  sanitizeKnownValues,
} from './intermediacao-fields';
import { interpretWithOpenAi } from './intermediacao-ia';
import { injectDocxPlaceholders, renderIntermediacaoDocx } from './intermediacao-docx';
import { fillPdfTemplate } from './intermediacao-pdf';
import { extractDocumentText, intermediacaoFileKind } from './intermediacao-text';

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
    private readonly media: MediaService,
    private readonly config: ConfigService,
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

  async analisarIntermediacao(
    file: Express.Multer.File | undefined,
    intencao: string | undefined,
    requester: AuthenticatedUser,
  ) {
    requireTenantId(requester);
    if (!file?.buffer?.length) {
      throw new BadRequestException('Envie um Word (.docx) ou PDF com texto.');
    }
    const { kind, text } = await extractDocumentText({
      buffer: file.buffer,
      filename: file.originalname || '',
      mimetype: file.mimetype || '',
    });
    const heuristic = extractIntermediacaoFields(text);
    let fields = heuristic.fields;
    let values = { ...heuristic.values };
    const avisos = [...heuristic.avisos];
    let fonte: 'regras' | 'ia+regras' = 'regras';

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: requireTenantId(requester) },
      select: { iaBotEnabled: true },
    });
    const apiKey = this.config.get<string>('OPENAI_API_KEY')?.trim();
    if (tenant?.iaBotEnabled && apiKey) {
      const ia = await interpretWithOpenAi({ text, apiKey });
      if (ia) {
        fonte = 'ia+regras';
        const merged: Record<string, string> = { ...ia.values, ...values };
        values = merged;
        const byKey = new Map(fields.map((item) => [item.key, item]));
        for (const item of ia.fields) {
          if (!byKey.has(item.key)) {
            fields = [...fields, item];
            byKey.set(item.key, item);
          }
        }
      }
    }

    if (kind === 'pdf' && intencao === 'modelo') {
      avisos.push(
        'PDF serve para ler dados. Para gerar no papel timbrado, envie o mesmo contrato em Word (.docx).',
      );
    }

    return {
      intencao: intencao === 'modelo' ? 'modelo' : 'extrair',
      kind,
      textPreview: text.slice(0, 1200),
      fields,
      values,
      avisos,
      fonte,
    };
  }

  async confirmarModeloIntermediacao(
    file: Express.Multer.File | undefined,
    mappingsRaw: unknown,
    requester: AuthenticatedUser,
  ) {
    if (requester.role !== Role.admin && requester.role !== Role.super_admin) {
      throw new ForbiddenException('Só o admin confirma o modelo da imobiliária.');
    }
    const tenantId = requireTenantId(requester);
    if (!file?.buffer?.length) {
      throw new BadRequestException('Envie o Word (.docx) ou PDF da imobiliária.');
    }
    const kind = intermediacaoFileKind(file.originalname || '', file.mimetype || '');
    const mappings = parseMappings(mappingsRaw);
    const nome = (file.originalname || 'contrato-intermediacao')
      .replace(/[/\\]/g, ' ')
      .slice(0, 160);

    const current = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        intermediacaoModeloPublicId: true,
        intermediacaoTemplatePublicId: true,
      },
    });
    if (!current) throw new NotFoundException('Tenant não encontrado.');

    const templateBuffer =
      kind === 'docx'
        ? injectDocxPlaceholders(file.buffer, mappings)
        : file.buffer;
    const templateMime =
      kind === 'docx'
        ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        : file.mimetype || 'application/pdf';
    const templateName =
      kind === 'docx' ? nome.replace(/\.docx$/i, '-template.docx') : nome;

    const original = await this.media.uploadRaw({
      buffer: file.buffer,
      mimetype: file.mimetype,
      filename: nome,
      folder: this.media.folder(tenantId, 'tenants', tenantId) + '/contratos',
    });
    const template = await this.media.uploadRaw({
      buffer: templateBuffer,
      mimetype: templateMime,
      filename: templateName,
      folder: this.media.folder(tenantId, 'tenants', tenantId) + '/contratos',
    });

    await this.media.destroyRaw(current.intermediacaoModeloPublicId);
    await this.media.destroyRaw(current.intermediacaoTemplatePublicId);

    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        intermediacaoModeloUrl: original.url,
        intermediacaoModeloPublicId: original.publicId,
        intermediacaoModeloNome: nome,
        intermediacaoTemplateUrl: template.url,
        intermediacaoTemplatePublicId: template.publicId,
        intermediacaoCampoMap: mappings as Prisma.InputJsonValue,
      },
      select: {
        intermediacaoModeloUrl: true,
        intermediacaoModeloNome: true,
        intermediacaoTemplateUrl: true,
      },
    });
  }

  async generateIntermediacaoDocx(
    rawValues: Record<string, string>,
    requester: AuthenticatedUser,
  ) {
    const filled = await this.fillIntermediacaoTemplate(rawValues, requester, 'docx');
    return filled;
  }

  async generateIntermediacaoPdf(
    rawValues: Record<string, string>,
    requester: AuthenticatedUser,
  ) {
    return this.fillIntermediacaoTemplate(rawValues, requester, 'pdf');
  }

  private async fillIntermediacaoTemplate(
    rawValues: Record<string, string>,
    requester: AuthenticatedUser,
    want: 'docx' | 'pdf',
  ) {
    const tenantId = requireTenantId(requester);
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        name: true,
        documento: true,
        creci: true,
        email: true,
        endereco: true,
        cidade: true,
        banco: true,
        agencia: true,
        contaBancaria: true,
        pix: true,
        representanteLegal: true,
        intermediacaoTemplateUrl: true,
        intermediacaoModeloNome: true,
        intermediacaoCampoMap: true,
      },
    });
    if (!tenant?.intermediacaoTemplateUrl) {
      throw new BadRequestException(
        'A imobiliária ainda não confirmou o arquivo como modelo preenchível.',
      );
    }

    const values = sanitizeKnownValues(rawValues);
    fillIfEmpty(values, 'contratadaNome', tenant.name);
    fillIfEmpty(values, 'contratadaCnpj', tenant.documento);
    fillIfEmpty(values, 'contratadaCreci', tenant.creci);
    fillIfEmpty(values, 'contratadaEmail', tenant.email);
    fillIfEmpty(values, 'contratadaEndereco', tenant.endereco);
    fillIfEmpty(values, 'cidade', tenant.cidade);
    fillIfEmpty(values, 'banco', tenant.banco);
    fillIfEmpty(values, 'agencia', tenant.agencia);
    fillIfEmpty(values, 'conta', tenant.contaBancaria);
    fillIfEmpty(values, 'pix', tenant.pix);
    fillIfEmpty(values, 'representanteLegal', tenant.representanteLegal);

    const nome = tenant.intermediacaoModeloNome?.toLowerCase() ?? '';
    const mappings = parseMappings(tenant.intermediacaoCampoMap ?? []);
    const response = await fetch(tenant.intermediacaoTemplateUrl);
    if (!response.ok) {
      throw new BadRequestException('Não foi possível baixar o modelo da imobiliária.');
    }
    const templateBuffer = Buffer.from(await response.arrayBuffer());
    const base = `contrato-intermediacao-${safeName(values.contratanteNome || 'cliente')}`;

    if (want === 'pdf') {
      if (!nome.endsWith('.pdf')) {
        throw new BadRequestException(
          'O modelo confirmado não é PDF. Use Baixar Word da imobiliária.',
        );
      }
      const buffer = await fillPdfTemplate(templateBuffer, mappings, values);
      return { buffer, filename: `${base}.pdf` };
    }

    if (nome.endsWith('.pdf')) {
      throw new BadRequestException(
        'O modelo confirmado é PDF. Use Baixar PDF para gerar no layout da imobiliária.',
      );
    }
    const buffer = renderIntermediacaoDocx(templateBuffer, values);
    return { buffer, filename: `${base}.docx` };
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

function fillIfEmpty(
  values: Record<string, string>,
  key: string,
  raw: string | null | undefined,
) {
  if (values[key]?.trim()) return;
  const next = raw?.trim();
  if (next) values[key] = next;
}

function parseMappings(raw: unknown): { key: string; snippet: string }[] {
  let parsed = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new BadRequestException('Mapeamento inválido.');
    }
  }
  if (parsed == null) parsed = [];
  if (!Array.isArray(parsed)) {
    throw new BadRequestException('Informe a lista de campos confirmados.');
  }
  const out: { key: string; snippet: string }[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;
    const key = String((item as { key?: string }).key ?? '').trim();
    const snippet = String((item as { snippet?: string }).snippet ?? '').trim();
    if (!INTERMEDIACAO_KEYS.includes(key as (typeof INTERMEDIACAO_KEYS)[number])) {
      continue;
    }
    if (!snippet) continue;
    out.push({ key, snippet });
  }
  return out;
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
