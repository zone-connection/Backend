import {
  BadRequestException,
  HttpException,
  Injectable,
} from '@nestjs/common';
import { FunilTipo } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LeadsService } from '../leads/leads.service';
import type { CreateLeadDto } from '../leads/dto/create-lead.dto';
import { ApiTecnicoAdapter } from './api-tecnico.adapter';
import type { CriarLeadApiDto } from './dto/criar-lead-api.dto';

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
