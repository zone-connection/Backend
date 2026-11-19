import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, VendaUsadoStatus } from '@prisma/client';
import { timingSafeEqual } from 'crypto';
import { FunisService } from '../funis/funis.service';
import { LeadMonitoramentoService } from '../leads/monitoramento/lead-monitoramento.service';
import { PrismaService } from '../prisma/prisma.service';

const RESULTADOS = [
  'sem_contato',
  'frio',
  'qualificado',
  'agendado',
  'recusou',
  'numero_invalido',
] as const;

export type IntegracaoImovelQuery = {
  finalidade?: string;
  bairro?: string;
  cidade?: string;
  quartos?: number;
  banheiros?: number;
  precoMin?: number;
  precoMax?: number;
  page?: number;
  pageSize?: number;
};

@Injectable()
export class IntegracoesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly funis: FunisService,
    private readonly monitoramento: LeadMonitoramentoService,
  ) {}

  async tenantIdFrom(headerSlug?: string): Promise<string> {
    const slug = (
      headerSlug?.trim() ||
      this.config.get<string>('INTEGRACAO_TENANT_SLUG')?.trim() ||
      ''
    );
    if (!slug) {
      throw new BadRequestException(
        'Informe o header X-Tenant ou a variável INTEGRACAO_TENANT_SLUG.',
      );
    }
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!tenant) throw new NotFoundException('Imobiliária não encontrada.');
    return tenant.id;
  }

  async listarImoveis(tenantId: string, query: IntegracaoImovelQuery) {
    const finalidade = (query.finalidade ?? 'venda').toLowerCase();
    if (!['venda', 'aluguel', 'lancamento'].includes(finalidade)) {
      throw new BadRequestException(
        'finalidade deve ser venda, aluguel ou lancamento.',
      );
    }
    if (finalidade === 'aluguel') {
      return { items: [], page: 1, total: 0 };
    }

    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(50, Math.max(1, query.pageSize ?? 10));
    const where: Prisma.ImovelWhereInput = {
      tenantId,
      ...(query.bairro
        ? { bairro: { contains: query.bairro, mode: 'insensitive' } }
        : {}),
      ...(query.cidade
        ? { cidade: { contains: query.cidade, mode: 'insensitive' } }
        : {}),
      ...(query.quartos ? { quartos: { gte: query.quartos } } : {}),
      ...(query.banheiros ? { banheiros: { gte: query.banheiros } } : {}),
      ...(finalidade === 'lancamento'
        ? { empreendimentoId: { not: null }, empreendimento: { ativo: true } }
        : {
            OR: [
              { vendaUsado: { isNot: null } },
              { captacoes: { some: {} } },
            ],
          }),
    };

    const rows = await this.prisma.imovel.findMany({
      where,
      include: {
        vendaUsado: { select: { precoVenda: true, status: true } },
        captacoes: {
          select: { valorPretendido: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        empreendimento: {
          select: { nome: true, valorReferencia: true, ativo: true, status: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });

    const mapped = rows
      .map((row) => this.toImovelItem(row, finalidade))
      .filter((item) => this.precoNaFaixa(item.preco, query.precoMin, query.precoMax));

    const start = (page - 1) * pageSize;
    return {
      items: mapped.slice(start, start + pageSize),
      page,
      total: mapped.length,
    };
  }

  async listarFunis(tenantId: string) {
    const funis = await this.prisma.funil.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        tipo: true,
        ativo: true,
        etapas: {
          where: { active: true },
          orderBy: { sortOrder: 'asc' },
          select: { id: true, label: true, slug: true, sortOrder: true },
        },
      },
    });
    return { items: funis };
  }

  async listarLeads(
    tenantId: string,
    query: { desde?: string; origem?: string },
  ) {
    const desde = query.desde ? new Date(query.desde) : undefined;
    if (query.desde && Number.isNaN(desde?.getTime())) {
      throw new BadRequestException('desde deve ser uma data ISO-8601.');
    }
    const origens = query.origem
      ?.split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    const leads = await this.prisma.lead.findMany({
      where: {
        tenantId,
        perdidoAt: null,
        ...(desde ? { createdAt: { gte: desde } } : {}),
        ...(origens?.length ? { origem: { in: origens } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        nome: true,
        telefone: true,
        email: true,
        origem: true,
        interesse: true,
        cidade: true,
        bairro: true,
        funilId: true,
        stage: true,
        createdAt: true,
      },
    });
    return {
      items: leads.map((lead) => ({
        ...lead,
        etapaSlug: lead.stage,
        criadoEm: lead.createdAt,
      })),
    };
  }

  async criarLead(
    tenantId: string,
    body: {
      nome?: string;
      telefone?: string;
      email?: string;
      origem?: string;
      interesse?: string;
      cidade?: string;
      bairro?: string;
      funilId?: string;
      etapaSlug?: string;
      observacao?: string;
    },
  ) {
    if (!body.nome?.trim() || body.nome.trim().length < 2) {
      throw new BadRequestException('nome é obrigatório.');
    }
    const telefone = formatarTelefone(body.telefone ?? '');
    if (!telefone) throw new BadRequestException('telefone inválido.');
    const interesse = body.interesse?.trim() || 'Comprar';
    if (interesse !== 'Comprar') {
      throw new BadRequestException(
        'interesse aceito hoje: Comprar. Aluguel ainda não está no catálogo.',
      );
    }

    const existente = await this.prisma.lead.findFirst({
      where: { tenantId, telefone, perdidoAt: null },
      select: { id: true },
    });
    if (existente) return { leadId: existente.id, criado: false };

    const placement = await this.funis.comercialPlacement(tenantId);
    const funilId = body.funilId?.trim() || placement.funilId;
    const stage = body.etapaSlug?.trim() || placement.stage;
    await this.exigirEtapa(tenantId, funilId, stage);
    const timing = await this.monitoramento.stageChangeData(
      tenantId,
      stage,
      new Date(),
      funilId,
    );
    const digits = telefone.replace(/\D/g, '');
    const created = await this.prisma.lead.create({
      data: {
        tenantId,
        nome: body.nome.trim(),
        telefone,
        email:
          body.email?.trim().toLowerCase() ||
          `contato.${digits}@sem-email.local`,
        origem: body.origem?.trim() || 'agente-voz',
        interesse,
        cidade: body.cidade?.trim() || 'Não informado',
        bairro: body.bairro?.trim() || 'Não informado',
        stage,
        funilId,
        tags: body.observacao?.trim()
          ? [`obs:${body.observacao.trim().slice(0, 180)}`]
          : [],
        ...timing,
      },
      select: { id: true },
    });
    return { leadId: created.id, criado: true };
  }

  async atualizarLead(
    tenantId: string,
    id: string,
    body: {
      nome?: string;
      telefone?: string;
      email?: string | null;
      origem?: string;
      cidade?: string;
      bairro?: string;
      observacao?: string;
    },
  ) {
    await this.exigirLead(tenantId, id);
    const telefone = body.telefone ? formatarTelefone(body.telefone) : undefined;
    if (body.telefone && !telefone) {
      throw new BadRequestException('telefone inválido.');
    }
    await this.prisma.lead.update({
      where: { id },
      data: {
        ...(body.nome ? { nome: body.nome.trim() } : {}),
        ...(telefone ? { telefone } : {}),
        ...(body.email !== undefined
          ? { email: body.email?.trim().toLowerCase() || '' }
          : {}),
        ...(body.origem ? { origem: body.origem.trim() } : {}),
        ...(body.cidade ? { cidade: body.cidade.trim() } : {}),
        ...(body.bairro ? { bairro: body.bairro.trim() } : {}),
        lastMovementAt: new Date(),
      },
    });
    return { leadId: id };
  }

  async moverEtapa(
    tenantId: string,
    id: string,
    body: { etapaSlug?: string; funilId?: string },
  ) {
    const lead = await this.exigirLead(tenantId, id);
    const funilId = body.funilId?.trim() || lead.funilId;
    const stage = body.etapaSlug?.trim();
    if (!stage) throw new BadRequestException('etapaSlug é obrigatório.');
    await this.exigirEtapa(tenantId, funilId, stage);
    const timing = await this.monitoramento.stageChangeData(
      tenantId,
      stage,
      new Date(),
      funilId,
    );
    await this.prisma.lead.update({
      where: { id },
      data: { stage, funilId, ...timing },
    });
    return { leadId: id, funilId, etapaSlug: stage };
  }

  assertWebhookSecret(header?: string) {
    const expected =
      this.config.get<string>('INTEGRACAO_WEBHOOK_SECRET')?.trim() ?? '';
    if (expected.length < 16) {
      throw new UnauthorizedException(
        'Webhook de chamada desligado: defina INTEGRACAO_WEBHOOK_SECRET.',
      );
    }
    const got = header?.trim() ?? '';
    const bufA = Buffer.from(got);
    const bufB = Buffer.from(expected);
    if (bufA.length !== bufB.length || !timingSafeEqual(bufA, bufB)) {
      throw new UnauthorizedException('Segredo do webhook inválido.');
    }
  }

  async receberChamada(
    tenantId: string,
    body: {
      externalId?: string;
      telefone?: string;
      leadId?: string | null;
      funilId?: string;
      etapaSlug?: string;
      inicioEm?: string;
      fimEm?: string;
      resumo?: string;
      transcricao?: string;
      imoveisOfertados?: string[];
      resultado?: string;
    },
  ) {
    const externalId = body.externalId?.trim();
    if (!externalId) throw new BadRequestException('externalId é obrigatório.');
    if (body.resultado && !RESULTADOS.includes(body.resultado as (typeof RESULTADOS)[number])) {
      throw new BadRequestException(
        `resultado inválido. Use: ${RESULTADOS.join(', ')}.`,
      );
    }

    const telefone = body.telefone ? formatarTelefone(body.telefone) : '';
    let leadId = body.leadId?.trim() || '';
    if (leadId) {
      await this.exigirLead(tenantId, leadId);
    } else if (telefone) {
      const found = await this.prisma.lead.findFirst({
        where: { tenantId, telefone, perdidoAt: null },
        select: { id: true },
      });
      leadId = found?.id ?? '';
    }

    if (leadId && body.etapaSlug) {
      await this.moverEtapa(tenantId, leadId, {
        etapaSlug: body.etapaSlug,
        funilId: body.funilId,
      });
    }

    const data = {
      tenantId,
      externalId,
      leadId: leadId || null,
      telefone: telefone || body.telefone?.trim() || '',
      funilId: body.funilId?.trim() || null,
      etapaSlug: body.etapaSlug?.trim() || null,
      inicioEm: parseData(body.inicioEm),
      fimEm: parseData(body.fimEm),
      resumo: body.resumo?.trim() ?? '',
      transcricao: body.transcricao ?? '',
      resultado: body.resultado?.trim() ?? '',
      imoveisOfertados: body.imoveisOfertados ?? [],
    };

    await this.prisma.integracaoChamada.upsert({
      where: { tenantId_externalId: { tenantId, externalId } },
      create: { id: crypto.randomUUID(), ...data },
      update: data,
    });

    return { leadId: leadId || null };
  }

  private async exigirLead(tenantId: string, id: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { id, tenantId },
      select: { id: true, funilId: true },
    });
    if (!lead) throw new NotFoundException('Lead não encontrado.');
    return lead;
  }

  private async exigirEtapa(tenantId: string, funilId: string, slug: string) {
    const etapa = await this.prisma.funilEtapa.findFirst({
      where: { slug, active: true, funil: { id: funilId, tenantId } },
      select: { id: true },
    });
    if (!etapa) {
      throw new BadRequestException(
        'Etapa não existe nesse funil. Consulte GET /integracoes/funis.',
      );
    }
  }

  private toImovelItem(
    row: {
      id: string;
      tipo: string;
      descricao: string;
      cidade: string;
      bairro: string;
      quartos: number | null;
      banheiros: number | null;
      vagas: number | null;
      area: Prisma.Decimal | null;
      empreendimentoId: string | null;
      vendaUsado: { precoVenda: Prisma.Decimal | null; status: VendaUsadoStatus } | null;
      captacoes: { valorPretendido: Prisma.Decimal | null }[];
      empreendimento: {
        nome: string;
        valorReferencia: number | null;
        status: string | null;
      } | null;
    },
    finalidade: string,
  ) {
    const precoVenda = numero(row.vendaUsado?.precoVenda);
    const precoCaptacao = numero(row.captacoes[0]?.valorPretendido);
    const preco =
      finalidade === 'lancamento'
        ? row.empreendimento?.valorReferencia ?? null
        : precoVenda ?? precoCaptacao;
    const status =
      finalidade === 'lancamento'
        ? 'disponivel'
        : row.vendaUsado?.status === 'reservado'
          ? 'reservado'
          : row.vendaUsado?.status === 'vendido'
            ? 'vendido'
            : row.vendaUsado?.status === 'indisponivel'
              ? 'inativo'
              : 'disponivel';
    return {
      id: row.id,
      codigo: row.id.slice(0, 8),
      finalidade,
      tipo: row.tipo,
      titulo:
        row.empreendimento?.nome ||
        row.descricao.slice(0, 80) ||
        `${row.tipo} ${row.bairro}`.trim(),
      cidade: row.cidade,
      bairro: row.bairro,
      quartos: row.quartos,
      banheiros: row.banheiros,
      vagas: row.vagas,
      areaM2: row.area ? Number(row.area) : null,
      preco,
      condominio: null,
      status,
    };
  }

  private precoNaFaixa(preco: number | null, min?: number, max?: number) {
    if (min == null && max == null) return true;
    if (preco == null) return false;
    if (min != null && preco < min) return false;
    if (max != null && preco > max) return false;
    return true;
  }
}

function numero(value: Prisma.Decimal | null | undefined): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseData(value?: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Aceita dígitos com DDD e devolve (DD) 9XXXX-XXXX ou (DD) XXXX-XXXX. */
export function formatarTelefone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '').replace(/^55/, '');
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  if (/^\(\d{2}\) \d{4,5}-\d{4}$/.test(raw.trim())) return raw.trim();
  return null;
}
