import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { requireTenantId } from '../common/utils/tenant';
import { NotificacoesService } from '../notificacoes/notificacoes.service';

export type MatchNivel = 'muito_compativel' | 'compativel';

export type MatchMotivo =
  | 'localizacao'
  | 'valor'
  | 'quartos'
  | 'vagas'
  | 'tags'
  | 'interesse_previo';

export type EmpreendimentoMatch = {
  lead: {
    id: string;
    tipo: string;
    nome: string;
    telefone: string;
    cidade: string;
    bairro: string;
    orcamentoMax: number | null;
    quartosMin: number | null;
    vagasMin: number | null;
    tags: string[];
    corretorId: string | null;
    corretor: { id: string; name: string } | null;
  };
  score: number;
  nivel: MatchNivel;
  motivos: MatchMotivo[];
  interessePrevio: boolean;
};

type EmpForMatch = {
  id: string;
  nome: string;
  cidade: string | null;
  construtoraId: string | null;
  quartos: number | null;
  vagas: number | null;
  valorReferencia: number | null;
  tags: string[];
  localidade: { id: string; nome: string } | null;
};

const WEIGHT = {
  localizacao: 25,
  valor: 25,
  quartos: 15,
  vagas: 15,
  tags: 15,
  interesse_previo: 25,
} as const;

function normalizePlace(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .trim();
}

function placesMatch(a: string | null | undefined, b: string | null | undefined) {
  const left = normalizePlace(a);
  const right = normalizePlace(b);
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

@Injectable()
export class MatchingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificacoes: NotificacoesService,
  ) {}

  async matchForEmpreendimento(
    empreendimentoId: string,
    requester: AuthenticatedUser,
  ): Promise<{
    empreendimentoId: string;
    total: number;
    muitoCompativeis: number;
    comInteressePrevio: number;
    matches: EmpreendimentoMatch[];
  }> {
    const tenantId = requireTenantId(requester);
    const emp = await this.loadEmpreendimento(empreendimentoId, tenantId);
    const matches = await this.computeMatches(tenantId, emp);
    return this.summarize(empreendimentoId, matches);
  }

  /** Calcula matches e notifica corretores donos (agregado, idempotente). */
  async runAfterEmpreendimentoChange(
    empreendimentoId: string,
    tenantId: string,
  ) {
    const emp = await this.loadEmpreendimento(empreendimentoId, tenantId);
    const matches = await this.computeMatches(tenantId, emp);
    if (matches.length === 0) return;

    const byCorretor = new Map<
      string,
      { name: string; matches: EmpreendimentoMatch[] }
    >();
    for (const match of matches) {
      const corretorId = match.lead.corretorId;
      if (!corretorId) continue;
      const current = byCorretor.get(corretorId) ?? {
        name: match.lead.corretor?.name ?? 'Corretor',
        matches: [],
      };
      current.matches.push(match);
      byCorretor.set(corretorId, current);
    }

    await Promise.all(
      [...byCorretor.entries()].map(([corretorId, group]) => {
        const muito = group.matches.filter(
          (m) => m.nivel === 'muito_compativel',
        ).length;
        const interesse = group.matches.filter((m) => m.interessePrevio).length;
        return this.notificacoes.createImovelCompativel({
          userId: corretorId,
          empreendimentoId: emp.id,
          empreendimentoNome: emp.nome,
          total: group.matches.length,
          muitoCompativeis: muito,
          comInteressePrevio: interesse,
          eventoChave: `match:${emp.id}:${corretorId}`,
        });
      }),
    );
  }

  private summarize(empreendimentoId: string, matches: EmpreendimentoMatch[]) {
    return {
      empreendimentoId,
      total: matches.length,
      muitoCompativeis: matches.filter((m) => m.nivel === 'muito_compativel')
        .length,
      comInteressePrevio: matches.filter((m) => m.interessePrevio).length,
      matches,
    };
  }

  private async loadEmpreendimento(
    id: string,
    tenantId: string,
  ): Promise<EmpForMatch> {
    const emp = await this.prisma.empreendimento.findFirst({
      where: { id, tenantId, ativo: true },
      select: {
        id: true,
        nome: true,
        cidade: true,
        construtoraId: true,
        quartos: true,
        vagas: true,
        valorReferencia: true,
        tags: true,
        localidade: { select: { id: true, nome: true } },
      },
    });
    if (!emp) {
      throw new NotFoundException('Empreendimento não encontrado.');
    }
    return emp;
  }

  private async computeMatches(
    tenantId: string,
    emp: EmpForMatch,
  ): Promise<EmpreendimentoMatch[]> {
    const leads = await this.prisma.lead.findMany({
      where: {
        tenantId,
        perdidoAt: null,
      },
      select: {
        id: true,
        tipo: true,
        nome: true,
        telefone: true,
        cidade: true,
        bairro: true,
        orcamentoMax: true,
        quartosMin: true,
        vagasMin: true,
        tags: true,
        corretorId: true,
        corretor: { select: { id: true, name: true } },
        construtoraId: true,
        empreendimentoId: true,
      },
      take: 2000,
    });

    const scored: EmpreendimentoMatch[] = [];
    for (const lead of leads) {
      const result = this.scoreLead(emp, lead);
      if (!result) continue;
      scored.push(result);
    }

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.interessePrevio !== b.interessePrevio) {
        return a.interessePrevio ? -1 : 1;
      }
      return a.lead.nome.localeCompare(b.lead.nome, 'pt-BR');
    });

    return scored;
  }

  private scoreLead(
    emp: EmpForMatch,
    lead: {
      id: string;
      tipo: string;
      nome: string;
      telefone: string;
      cidade: string;
      bairro: string;
      orcamentoMax: number | null;
      quartosMin: number | null;
      vagasMin: number | null;
      tags: string[];
      corretorId: string | null;
      corretor: { id: string; name: string } | null;
      construtoraId: string | null;
      empreendimentoId: string | null;
    },
  ): EmpreendimentoMatch | null {
    const motivos: MatchMotivo[] = [];
    let score = 0;
    let strongHits = 0;

    const locOk =
      placesMatch(lead.cidade, emp.cidade) ||
      placesMatch(lead.cidade, emp.localidade?.nome) ||
      placesMatch(lead.bairro, emp.cidade) ||
      placesMatch(lead.bairro, emp.localidade?.nome);
    if (locOk) {
      score += WEIGHT.localizacao;
      motivos.push('localizacao');
      strongHits += 1;
    }

    if (
      emp.valorReferencia != null &&
      lead.orcamentoMax != null &&
      emp.valorReferencia <= lead.orcamentoMax
    ) {
      score += WEIGHT.valor;
      motivos.push('valor');
      strongHits += 1;
    }

    if (
      lead.quartosMin != null &&
      emp.quartos != null &&
      emp.quartos >= lead.quartosMin
    ) {
      score += WEIGHT.quartos;
      motivos.push('quartos');
    }

    if (
      lead.vagasMin != null &&
      emp.vagas != null &&
      emp.vagas >= lead.vagasMin
    ) {
      score += WEIGHT.vagas;
      motivos.push('vagas');
    }

    const leadTags = new Set(
      lead.tags.map((t) => t.trim().toLocaleLowerCase('pt-BR')).filter(Boolean),
    );
    const empTags = emp.tags
      .map((t) => t.trim().toLocaleLowerCase('pt-BR'))
      .filter(Boolean);
    const tagHits = empTags.filter((t) => leadTags.has(t)).length;
    if (tagHits > 0) {
      score += Math.min(WEIGHT.tags, 5 * tagHits + 5);
      motivos.push('tags');
    }

    const interessePrevio =
      lead.empreendimentoId === emp.id ||
      (lead.construtoraId != null &&
        emp.construtoraId != null &&
        lead.construtoraId === emp.construtoraId);
    if (interessePrevio) {
      score += WEIGHT.interesse_previo;
      motivos.push('interesse_previo');
      strongHits += 1;
    }

    if (score < 40 || motivos.length === 0) return null;

    const nivel: MatchNivel =
      score >= 70 && strongHits >= 2 ? 'muito_compativel' : 'compativel';

    return {
      lead: {
        id: lead.id,
        tipo: lead.tipo,
        nome: lead.nome,
        telefone: lead.telefone,
        cidade: lead.cidade,
        bairro: lead.bairro,
        orcamentoMax: lead.orcamentoMax,
        quartosMin: lead.quartosMin,
        vagasMin: lead.vagasMin,
        tags: lead.tags,
        corretorId: lead.corretorId,
        corretor: lead.corretor,
      },
      score,
      nivel,
      motivos,
      interessePrevio,
    };
  }
}
