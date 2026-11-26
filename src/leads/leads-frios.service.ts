import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ContatoTipo, Prisma, Role } from '@prisma/client';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { isCorretorLike } from '../common/utils/roles';
import { requireTenantId } from '../common/utils/tenant';
import { FunisService } from '../funis/funis.service';
import { PrismaService } from '../prisma/prisma.service';
import { EnviarLeadsFriosDto, ImportLeadsFriosDto, LeadFrioIdsDto, QueryLeadsFriosDto } from './dto/leads-frios.dto';
import { leadSelect } from './lead-select';

const frioSelect = {
  ...leadSelect,
} satisfies Prisma.LeadSelect;

@Injectable()
export class LeadsFriosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly funis: FunisService,
  ) {}

  private assertAtivo(requester: AuthenticatedUser) {
    if (requester.tenantModules?.leadsFrios !== true) {
      throw new ForbiddenException('A base de leads frios está desativada.');
    }
  }

  async list(requester: AuthenticatedUser, query: QueryLeadsFriosDto) {
    this.assertAtivo(requester);
    const tenantId = requireTenantId(requester);
    const page = query.page ?? 1;
    const pageSize = query.pageSize === 50 ? 50 : 20;
    const q = query.q?.trim();
    const where: Prisma.LeadWhereInput = {
      tenantId,
      baseFria: true,
      perdidoAt: null,
      tipo: ContatoTipo.lead,
      ...(q
        ? {
            OR: [
              { nome: { contains: q, mode: 'insensitive' } },
              { telefone: { contains: q } },
              { cidade: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const total = await this.prisma.lead.count({ where });
    const lastPage = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, lastPage);
    const items = await this.prisma.lead.findMany({
      where,
      select: frioSelect,
      orderBy: [{ baseFriaEm: 'asc' }, { id: 'asc' }],
      skip: (safePage - 1) * pageSize,
      take: pageSize,
    });
    return { items, total, page: safePage, pageSize };
  }

  async importRows(dto: ImportLeadsFriosDto, requester: AuthenticatedUser) {
    this.assertAtivo(requester);
    if (
      requester.role !== Role.admin &&
      requester.role !== Role.super_admin &&
      requester.role !== Role.gerente
    ) {
      throw new ForbiddenException('Só a gestão envia planilha para a base fria.');
    }
    const tenantId = requireTenantId(requester);
    const placement = await this.funis.comercialPlacement(tenantId);
    const now = new Date();
    const empreendimentos = await this.prisma.empreendimento.findMany({
      where: { tenantId },
      select: { id: true, nome: true },
    });
    const porNome = new Map(
      empreendimentos.map((item) => [item.nome.trim().toLowerCase(), item.id]),
    );
    let created = 0;
    for (const [index, row] of dto.rows.entries()) {
      const telefone = row.telefone.trim();
      const digits = telefone.replace(/\D/g, '');
      if (digits.length < 8) continue;
      const nomeEmpreendimento = row.empreendimento?.trim() ?? '';
      let empreendimentoId: string | null = null;
      if (nomeEmpreendimento) {
        const chave = nomeEmpreendimento.toLowerCase();
        empreendimentoId = porNome.get(chave) ?? null;
        if (!empreendimentoId) {
          const criado = await this.prisma.empreendimento.create({
            data: {
              tenantId,
              nome: nomeEmpreendimento,
              finalidade: 'lancamento',
              externalKey: `base-fria-${chave.replace(/[^a-z0-9]+/g, '-').slice(0, 40)}-${Date.now()}-${index}`,
            },
            select: { id: true },
          });
          empreendimentoId = criado.id;
          porNome.set(chave, criado.id);
        }
      }
      const email =
        row.email?.trim().toLowerCase() ||
        `frio.${digits}.${index}@sem-email.local`;
      await this.prisma.lead.create({
        data: {
          tenantId,
          tipo: ContatoTipo.lead,
          nome: row.nome.trim(),
          telefone,
          email,
          origem: row.origem?.trim() || 'Base fria',
          interesse: 'Comprar',
          cidade: row.cidade?.trim() || '',
          bairro: row.bairro?.trim() || '',
          renda: typeof row.renda === 'number' ? Math.round(row.renda) : null,
          tipoRenda: row.tipoRenda?.trim() || null,
          estadoCivil: row.estadoCivil?.trim() || null,
          empreendimentoId,
          stage: placement.stage,
          funilId: placement.funilId,
          prioridade: 'Média',
          corretorId: null,
          equipeId: null,
          baseFria: true,
          origemBaseFria: true,
          baseFriaEm: now,
          stageEnteredAt: now,
          lastMovementAt: now,
        },
      });
      created += 1;
    }
    if (created === 0) {
      throw new BadRequestException('Nenhum lead válido na planilha.');
    }
    return { created };
  }

  async puxar(dto: LeadFrioIdsDto, requester: AuthenticatedUser) {
    this.assertAtivo(requester);
    const tenantId = requireTenantId(requester);
    const corretorId = requester.id;
    const updated = await this.prisma.lead.updateMany({
      where: {
        tenantId,
        id: { in: dto.ids },
        baseFria: true,
        perdidoAt: null,
      },
      data: {
        baseFria: false,
        origemBaseFria: true,
        baseFriaEm: null,
        corretorId,
        equipeId: null,
        lastMovementAt: new Date(),
      },
    });
    return { updated: updated.count };
  }

  private phoneKey(value: string) {
    const trimmed = value.trim();
    let digits = trimmed.replace(/\D/g, '');
    const brasil =
      digits.startsWith('55') && (digits.length === 12 || digits.length === 13);
    if (trimmed.startsWith('+')) {
      if (brasil) return digits.slice(2, 13);
      return digits.slice(0, 15);
    }
    if (digits.startsWith('55') && digits.length >= 12) digits = digits.slice(2);
    return digits.slice(0, 11);
  }

  private async classificarEnvio(dto: EnviarLeadsFriosDto, requester: AuthenticatedUser) {
    this.assertAtivo(requester);
    const tenantId = requireTenantId(requester);
    const gestor =
      requester.role === Role.admin ||
      requester.role === Role.super_admin ||
      requester.role === Role.gerente;
    const [selecionados, frios] = await Promise.all([
      this.prisma.lead.findMany({
        where: {
          tenantId,
          id: { in: dto.ids },
          tipo: ContatoTipo.lead,
          ...(gestor ? {} : { corretorId: requester.id }),
        },
        select: {
          id: true,
          nome: true,
          telefone: true,
          email: true,
          cidade: true,
          baseFria: true,
          perdidoAt: true,
        },
      }),
      this.prisma.lead.findMany({
        where: { tenantId, baseFria: true, perdidoAt: null, tipo: ContatoTipo.lead },
        select: { id: true, telefone: true, nome: true },
      }),
    ]);
    const frioPorTelefone = new Map<string, { id: string; nome: string }>();
    for (const frio of frios) {
      const key = this.phoneKey(frio.telefone);
      if (key.length >= 8 && !frioPorTelefone.has(key)) {
        frioPorTelefone.set(key, { id: frio.id, nome: frio.nome });
      }
    }
    const prontos: Array<{ id: string; nome: string; telefone: string; email: string; cidade: string }> = [];
    const jaNoBolsao: Array<{
      id: string;
      nome: string;
      telefone: string;
      email: string;
      cidade: string;
      existente: string;
    }> = [];
    for (const lead of selecionados) {
      const row = {
        id: lead.id,
        nome: lead.nome,
        telefone: lead.telefone,
        email: lead.email,
        cidade: lead.cidade,
      };
      if (lead.baseFria || lead.perdidoAt) continue;
      const key = this.phoneKey(lead.telefone);
      const existente = key.length >= 8 ? frioPorTelefone.get(key) : undefined;
      if (existente && existente.id !== lead.id) {
        jaNoBolsao.push({ ...row, existente: existente.nome });
        continue;
      }
      prontos.push(row);
    }
    return { prontos, jaNoBolsao };
  }

  async conferirEnvio(dto: EnviarLeadsFriosDto, requester: AuthenticatedUser) {
    const { prontos, jaNoBolsao } = await this.classificarEnvio(dto, requester);
    return {
      prontos,
      jaNoBolsao,
      prontosCount: prontos.length,
      repetidosCount: jaNoBolsao.length,
    };
  }

  /** Tira leads ativos do funil e coloca na base fria, sem criar segunda cópia. */
  async enviar(dto: EnviarLeadsFriosDto, requester: AuthenticatedUser) {
    const { prontos, jaNoBolsao } = await this.classificarEnvio(dto, requester);
    if (prontos.length === 0) {
      return { updated: 0, skipped: jaNoBolsao.length };
    }
    const now = new Date();
    const updated = await this.prisma.lead.updateMany({
      where: { id: { in: prontos.map((lead) => lead.id) } },
      data: {
        baseFria: true,
        origemBaseFria: true,
        baseFriaEm: now,
        corretorId: null,
        equipeId: null,
        lastMovementAt: now,
      },
    });
    return { updated: updated.count, skipped: jaNoBolsao.length };
  }

  async devolver(id: string, requester: AuthenticatedUser) {
    this.assertAtivo(requester);
    const tenantId = requireTenantId(requester);
    const lead = await this.prisma.lead.findFirst({
      where: { id, tenantId, tipo: ContatoTipo.lead },
      select: { id: true, corretorId: true, baseFria: true, origemBaseFria: true },
    });
    if (!lead) throw new NotFoundException('Lead não encontrado.');
    if (!lead.origemBaseFria) {
      throw new BadRequestException(
        'Só um lead que veio da base fria pode voltar para ela.',
      );
    }
    const gestor =
      requester.role === Role.admin ||
      requester.role === Role.super_admin ||
      requester.role === Role.gerente;
    if (!gestor && lead.corretorId !== requester.id) {
      throw new ForbiddenException('Só o corretor deste lead pode devolvê-lo.');
    }
    if (lead.baseFria) {
      throw new BadRequestException('Este lead já está na base fria.');
    }
    if (isCorretorLike(requester.role) && lead.corretorId !== requester.id) {
      throw new ForbiddenException('Só o corretor deste lead pode devolvê-lo.');
    }
    const now = new Date();
    return this.prisma.lead.update({
      where: { id },
      data: {
        baseFria: true,
        origemBaseFria: true,
        baseFriaEm: now,
        corretorId: null,
        equipeId: null,
        perdidoAt: null,
        motivoPerda: null,
        perdidoPorId: null,
        lastMovementAt: now,
      },
      select: frioSelect,
    });
  }

  async apagar(dto: LeadFrioIdsDto, requester: AuthenticatedUser) {
    this.assertAtivo(requester);
    if (
      requester.role !== Role.admin &&
      requester.role !== Role.super_admin
    ) {
      throw new ForbiddenException('Só o administrador apaga leads da base fria.');
    }
    const tenantId = requireTenantId(requester);
    const result = await this.prisma.lead.deleteMany({
      where: {
        tenantId,
        id: { in: dto.ids },
        baseFria: true,
      },
    });
    return { deleted: result.count };
  }
}
