import {
  BadRequestException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ContatoTipo, FunilTipo, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LeadsService } from '../leads/leads.service';
import type { CreateLeadDto } from '../leads/dto/create-lead.dto';
import { ApiTecnicoAdapter } from './api-tecnico.adapter';
import type { CriarLeadApiDto } from './dto/criar-lead-api.dto';
import type { AtualizarLeadApiDto } from './dto/atualizar-lead-api.dto';
import type { ListarLeadsApiDto } from './dto/listar-leads-api.dto';

const SEM_ETAPAS = 'COMMERCIAL_FUNNEL_WITHOUT_STAGES';
const SEM_FUNIL = 'COMMERCIAL_FUNNEL_NOT_FOUND';

type LeadInterno = {
  id: string;
  nome: string;
  telefone: string;
  email: string;
  origem: string;
  interesse: string;
  cidade: string;
  bairro: string;
  stage: string;
  funilId: string | null;
  prioridade: string;
  corretorId: string | null;
  corretor?: { name?: string | null } | null;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class ApiLeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leads: LeadsService,
    private readonly tecnico: ApiTecnicoAdapter,
  ) {}

  async criar(tenantId: string, body: CriarLeadApiDto) {
    const actor = await this.tecnico.contexto(tenantId);
    await this.funilComercialComEtapas(tenantId, body.stage);

    const dto: CreateLeadDto = {
      nome: body.nome,
      telefone: body.telefone,
      interesse: body.interesse,
      cidade: body.cidade,
      bairro: body.bairro,
      email: body.email,
      origem: body.origem,
      stage: body.stage,
      prioridade: body.prioridade,
    };

    let created: LeadInterno;
    try {
      created = (await this.leads.create(dto, actor)) as LeadInterno;
    } catch (err) {
      throw mapearErroCriacao(err);
    }
    return respostaPublica(created);
  }

  async listar(tenantId: string, query: ListarLeadsApiDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = filtroLeads(tenantId, query);
    const [total, rows] = await Promise.all([
      this.prisma.lead.count({ where }),
      this.prisma.lead.findMany({
        where,
        select: leadApiSelect,
        orderBy: ordemLead(query.sort),
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return {
      data: rows.map((row) => respostaPublica(row)),
      pagination: {
        page,
        limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / limit),
      },
    };
  }

  async detalhe(tenantId: string, id: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { id, tenantId, perdidoAt: null, tipo: ContatoTipo.lead },
      select: leadApiSelect,
    });
    if (!lead) throw new NotFoundException('Lead não encontrado.');
    return respostaPublica(lead);
  }

  async atualizar(tenantId: string, id: string, body: AtualizarLeadApiDto) {
    await this.leadDoTenant(tenantId, id);
    const actor = await this.tecnico.contexto(tenantId);
    const dto = {
      ...body,
      ...(body.origem === null ? { origem: '' } : {}),
    };
    const updated = (await this.leads.update(id, dto, actor)) as LeadInterno;
    return respostaPublica(updated);
  }

  async mover(tenantId: string, id: string, stage: string) {
    const lead = await this.leadDoTenant(tenantId, id);
    await this.etapaDoFunilAtual(lead.funilId, stage);
    const actor = await this.tecnico.contexto(tenantId);
    const moved = (await this.leads.updateStage(id, { stage }, actor)) as LeadInterno;
    return respostaPublica(moved);
  }

  private async leadDoTenant(tenantId: string, id: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { id, tenantId, perdidoAt: null, tipo: ContatoTipo.lead },
      select: { id: true, funilId: true },
    });
    if (!lead) throw new NotFoundException('Lead não encontrado.');
    return lead;
  }

  private async etapaDoFunilAtual(funilId: string | null, stage: string) {
    if (!funilId) throw new BadRequestException('Etapa do funil inválida.');
    const etapa = await this.prisma.funilEtapa.findFirst({
      where: { funilId, slug: stage, active: true },
      select: { id: true },
    });
    if (!etapa) throw new BadRequestException('Etapa do funil inválida.');
  }

  private async funilComercialComEtapas(tenantId: string, stage?: string) {
    const funil = await this.prisma.funil.findFirst({
      where: { tenantId, tipo: FunilTipo.comercial, ativo: true },
      select: {
        id: true,
        etapas: {
          where: { active: true },
          select: { slug: true },
        },
      },
    });
    if (!funil) {
      throw erroFunil(
        SEM_FUNIL,
        'Esta imobiliária não possui funil comercial ativo.',
      );
    }
    if (funil.etapas.length === 0) {
      throw erroFunil(
        SEM_ETAPAS,
        'O funil comercial desta imobiliária não possui etapas ativas.',
      );
    }
    if (stage && !funil.etapas.some((etapa) => etapa.slug === stage)) {
      throw new BadRequestException('Etapa do funil inválida.');
    }
  }
}

const leadApiSelect = {
  id: true,
  nome: true,
  telefone: true,
  email: true,
  origem: true,
  interesse: true,
  cidade: true,
  bairro: true,
  stage: true,
  funilId: true,
  prioridade: true,
  corretorId: true,
  corretor: { select: { name: true } },
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.LeadSelect;

function filtroLeads(tenantId: string, query: ListarLeadsApiDto): Prisma.LeadWhereInput {
  const search = query.search?.trim();
  return {
    tenantId,
    tipo: ContatoTipo.lead,
    perdidoAt: null,
    ...(query.stage ? { stage: query.stage } : {}),
    ...(query.origem ? { origem: query.origem } : {}),
    ...(search
      ? {
          OR: [
            { nome: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
            { telefone: { contains: search, mode: 'insensitive' } },
            { cidade: { contains: search, mode: 'insensitive' } },
            { bairro: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
}

function ordemLead(sort: ListarLeadsApiDto['sort']): Prisma.LeadOrderByWithRelationInput {
  if (sort === 'created_asc') return { createdAt: 'asc' };
  if (sort === 'nome_asc') return { nome: 'asc' };
  if (sort === 'nome_desc') return { nome: 'desc' };
  return { createdAt: 'desc' };
}

export function respostaPublica(lead: LeadInterno) {
  return {
    id: lead.id,
    nome: lead.nome,
    telefone: lead.telefone,
    email: lead.email,
    origem: lead.origem,
    interesse: lead.interesse,
    cidade: lead.cidade,
    bairro: lead.bairro,
    stage: lead.stage,
    funilId: lead.funilId,
    prioridade: lead.prioridade,
    corretorId: lead.corretorId,
    corretorNome: lead.corretor?.name ?? null,
    criadoEm: lead.createdAt,
    atualizadoEm: lead.updatedAt,
  };
}

function erroFunil(code: string, message: string) {
  return new HttpException({ statusCode: 422, code, message }, 422);
}

function mapearErroCriacao(err: unknown): unknown {
  if (
    err instanceof BadRequestException &&
    mensagem(err).includes('Nenhuma etapa do funil cadastrada')
  ) {
    return erroFunil(
      SEM_ETAPAS,
      'O funil comercial desta imobiliária não possui etapas ativas.',
    );
  }
  return err;
}

function mensagem(err: BadRequestException): string {
  const body = err.getResponse();
  if (typeof body === 'string') return body;
  if (body && typeof body === 'object' && 'message' in body) {
    const message = (body as { message: unknown }).message;
    return Array.isArray(message) ? message.join(' ') : String(message ?? '');
  }
  return err.message;
}
