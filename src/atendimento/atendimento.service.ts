import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { LeadAtribuicaoAcao, Role } from '@prisma/client';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { requireTenantId } from '../common/utils/tenant';
import { PrismaService } from '../prisma/prisma.service';
import {
  checklistCompleto,
  statusCadencia,
  type ItemChecklist,
} from './atendimento.regras';

function admin(user: AuthenticatedUser) {
  const role = String(user.role);
  return role === Role.admin || role === Role.super_admin;
}

@Injectable()
export class AtendimentoService {
  constructor(private readonly prisma: PrismaService) {}

  private tenant(user: AuthenticatedUser) {
    return requireTenantId(user);
  }

  private exigirAdmin(user: AuthenticatedUser) {
    if (!admin(user)) {
      throw new ForbiddenException('Só o administrador configura cadência e checklist.');
    }
  }

  async config(user: AuthenticatedUser) {
    const tenantId = this.tenant(user);
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { cadenciaAtiva: true, checklistAtivo: true },
    });
    const [etapas, modelos, funis] = await Promise.all([
      this.prisma.cadenciaEtapa.findMany({
        where: { tenantId },
        orderBy: { ordem: 'asc' },
      }),
      this.prisma.checklistModelo.findMany({
        where: { tenantId },
        orderBy: { ordem: 'asc' },
        include: { itens: { orderBy: { ordem: 'asc' } }, funil: { select: { name: true } } },
      }),
      this.prisma.funil.findMany({
        where: { tenantId },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
    ]);
    return {
      cadenciaAtiva: tenant?.cadenciaAtiva ?? false,
      checklistAtivo: tenant?.checklistAtivo ?? false,
      etapas,
      modelos: modelos.map((modelo) => ({
        id: modelo.id,
        nome: modelo.nome,
        funilId: modelo.funilId,
        funilNome: modelo.funil?.name ?? null,
        ordem: modelo.ordem,
        itens: modelo.itens,
      })),
      funis,
    };
  }

  async atualizarFlags(
    user: AuthenticatedUser,
    input: { cadenciaAtiva?: boolean; checklistAtivo?: boolean },
  ) {
    this.exigirAdmin(user);
    const tenantId = this.tenant(user);
    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        ...(typeof input.cadenciaAtiva === 'boolean'
          ? { cadenciaAtiva: input.cadenciaAtiva }
          : {}),
        ...(typeof input.checklistAtivo === 'boolean'
          ? { checklistAtivo: input.checklistAtivo }
          : {}),
      },
      select: { cadenciaAtiva: true, checklistAtivo: true },
    });
  }

  async criarEtapa(
    user: AuthenticatedUser,
    input: { dia: number; acao: string; descricao?: string },
  ) {
    this.exigirAdmin(user);
    const tenantId = this.tenant(user);
    const acao = input.acao?.trim() ?? '';
    const dia = Number(input.dia);
    if (!acao || !Number.isInteger(dia) || dia < 1 || dia > 365) {
      throw new BadRequestException('Informe o dia e a ação da etapa.');
    }
    const ultima = await this.prisma.cadenciaEtapa.aggregate({
      where: { tenantId },
      _max: { ordem: true },
    });
    return this.prisma.cadenciaEtapa.create({
      data: {
        tenantId,
        ordem: (ultima._max.ordem ?? 0) + 1,
        dia,
        acao: acao.slice(0, 80),
        descricao: (input.descricao ?? '').trim().slice(0, 400),
      },
    });
  }

  async editarEtapa(
    user: AuthenticatedUser,
    id: string,
    input: { dia?: number; acao?: string; descricao?: string },
  ) {
    this.exigirAdmin(user);
    const etapa = await this.etapaDoTenant(user, id);
    const dia = input.dia == null ? etapa.dia : Number(input.dia);
    const acao = input.acao == null ? etapa.acao : input.acao.trim();
    if (!acao || !Number.isInteger(dia) || dia < 1 || dia > 365) {
      throw new BadRequestException('Informe o dia e a ação da etapa.');
    }
    return this.prisma.cadenciaEtapa.update({
      where: { id },
      data: {
        dia,
        acao: acao.slice(0, 80),
        ...(input.descricao != null
          ? { descricao: input.descricao.trim().slice(0, 400) }
          : {}),
      },
    });
  }

  async excluirEtapa(user: AuthenticatedUser, id: string) {
    this.exigirAdmin(user);
    await this.etapaDoTenant(user, id);
    await this.prisma.cadenciaEtapa.delete({ where: { id } });
    return { ok: true };
  }

  async ordenarEtapas(user: AuthenticatedUser, ids: string[]) {
    this.exigirAdmin(user);
    const tenantId = this.tenant(user);
    const atuais = await this.prisma.cadenciaEtapa.findMany({
      where: { tenantId },
      select: { id: true },
    });
    const conhecidos = new Set(atuais.map((item) => item.id));
    if (ids.length !== conhecidos.size || ids.some((id) => !conhecidos.has(id))) {
      throw new BadRequestException('A ordem da cadência está incompleta.');
    }
    await this.prisma.$transaction(
      ids.map((id, index) =>
        this.prisma.cadenciaEtapa.update({
          where: { id },
          data: { ordem: index + 1 },
        }),
      ),
    );
    return { ok: true };
  }

  async criarModelo(user: AuthenticatedUser, input: { nome: string; funilId?: string | null }) {
    this.exigirAdmin(user);
    const tenantId = this.tenant(user);
    const nome = input.nome?.trim() ?? '';
    if (!nome) throw new BadRequestException('Informe o nome do checklist.');
    await this.funilDoTenant(tenantId, input.funilId);
    const ultima = await this.prisma.checklistModelo.aggregate({
      where: { tenantId },
      _max: { ordem: true },
    });
    return this.prisma.checklistModelo.create({
      data: {
        tenantId,
        nome: nome.slice(0, 80),
        funilId: input.funilId || null,
        ordem: (ultima._max.ordem ?? 0) + 1,
      },
      include: { itens: true },
    });
  }

  async editarModelo(
    user: AuthenticatedUser,
    id: string,
    input: { nome?: string; funilId?: string | null },
  ) {
    this.exigirAdmin(user);
    const modelo = await this.modeloDoTenant(user, id);
    if (input.funilId !== undefined) {
      await this.funilDoTenant(modelo.tenantId, input.funilId);
    }
    const nome = input.nome == null ? modelo.nome : input.nome.trim();
    if (!nome) throw new BadRequestException('Informe o nome do checklist.');
    return this.prisma.checklistModelo.update({
      where: { id },
      data: {
        nome: nome.slice(0, 80),
        ...(input.funilId !== undefined ? { funilId: input.funilId || null } : {}),
      },
      include: { itens: { orderBy: { ordem: 'asc' } } },
    });
  }

  async excluirModelo(user: AuthenticatedUser, id: string) {
    this.exigirAdmin(user);
    await this.modeloDoTenant(user, id);
    await this.prisma.checklistModelo.delete({ where: { id } });
    return { ok: true };
  }

  async criarItem(
    user: AuthenticatedUser,
    modeloId: string,
    input: { texto: string; obrigatorio?: boolean },
  ) {
    this.exigirAdmin(user);
    await this.modeloDoTenant(user, modeloId);
    const texto = input.texto?.trim() ?? '';
    if (!texto) throw new BadRequestException('Informe o item do checklist.');
    const ultima = await this.prisma.checklistItem.aggregate({
      where: { modeloId },
      _max: { ordem: true },
    });
    return this.prisma.checklistItem.create({
      data: {
        modeloId,
        ordem: (ultima._max.ordem ?? 0) + 1,
        texto: texto.slice(0, 200),
        obrigatorio: Boolean(input.obrigatorio),
      },
    });
  }

  async editarItem(
    user: AuthenticatedUser,
    id: string,
    input: { texto?: string; obrigatorio?: boolean },
  ) {
    this.exigirAdmin(user);
    const item = await this.itemDoTenant(user, id);
    const texto = input.texto == null ? item.texto : input.texto.trim();
    if (!texto) throw new BadRequestException('Informe o item do checklist.');
    return this.prisma.checklistItem.update({
      where: { id },
      data: {
        texto: texto.slice(0, 200),
        ...(typeof input.obrigatorio === 'boolean'
          ? { obrigatorio: input.obrigatorio }
          : {}),
      },
    });
  }

  async excluirItem(user: AuthenticatedUser, id: string) {
    this.exigirAdmin(user);
    await this.itemDoTenant(user, id);
    await this.prisma.checklistItem.delete({ where: { id } });
    return { ok: true };
  }

  async ordenarItens(user: AuthenticatedUser, modeloId: string, ids: string[]) {
    this.exigirAdmin(user);
    await this.modeloDoTenant(user, modeloId);
    const atuais = await this.prisma.checklistItem.findMany({
      where: { modeloId },
      select: { id: true },
    });
    const conhecidos = new Set(atuais.map((item) => item.id));
    if (ids.length !== conhecidos.size || ids.some((id) => !conhecidos.has(id))) {
      throw new BadRequestException('A ordem do checklist está incompleta.');
    }
    await this.prisma.$transaction(
      ids.map((id, index) =>
        this.prisma.checklistItem.update({ where: { id }, data: { ordem: index + 1 } }),
      ),
    );
    return { ok: true };
  }

  async sla(user: AuthenticatedUser) {
    const tenantId = this.tenant(user);
    const agora = new Date();
    const aberto = { tenantId, prazoDueAt: { not: null } };
    const [dentro, vencido, redistribuicoes, leads] = await Promise.all([
      this.prisma.lead.count({ where: { ...aberto, prazoDueAt: { gte: agora } } }),
      this.prisma.lead.count({ where: { ...aberto, prazoDueAt: { lt: agora } } }),
      this.prisma.leadReatribuicao.count({
        where: { tenantId, acao: LeadAtribuicaoAcao.redistribuicao },
      }),
      this.prisma.lead.findMany({
        where: { ...aberto, corretorId: { not: null } },
        select: {
          stageEnteredAt: true,
          corretor: { select: { id: true, name: true } },
        },
      }),
    ]);
    const grupos = new Map<string, { nome: string; somaMs: number; quantidade: number }>();
    for (const lead of leads) {
      if (!lead.corretor) continue;
      const atual = grupos.get(lead.corretor.id) ?? {
        nome: lead.corretor.name,
        somaMs: 0,
        quantidade: 0,
      };
      atual.somaMs += Math.max(0, agora.getTime() - lead.stageEnteredAt.getTime());
      atual.quantidade += 1;
      grupos.set(lead.corretor.id, atual);
    }
    return {
      dentroDoPrazo: dentro,
      slaVencido: vencido,
      redistribuicoes,
      porCorretor: [...grupos.entries()]
        .map(([id, grupo]) => ({
          corretorId: id,
          nome: grupo.nome,
          leads: grupo.quantidade,
          tempoMedioHoras: Math.round(grupo.somaMs / grupo.quantidade / 36e5),
        }))
        .sort((a, b) => b.leads - a.leads),
    };
  }

  async completos(user: AuthenticatedUser) {
    const tenantId = this.tenant(user);
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { checklistAtivo: true },
    });
    if (!tenant?.checklistAtivo) return { ativo: false, leadIds: [] as string[] };
    const [modelos, leads] = await Promise.all([
      this.prisma.checklistModelo.findMany({
        where: { tenantId },
        include: { itens: true },
      }),
      this.prisma.lead.findMany({
        where: { tenantId },
        select: {
          id: true,
          funilId: true,
          checklistMarcacoes: { select: { itemId: true } },
        },
      }),
    ]);
    const leadIds = leads
      .filter((lead) => {
        const itens = this.itensAplicaveis(modelos, lead.funilId);
        const marcados = new Set(
          lead.checklistMarcacoes.map((marca) => marca.itemId).filter((id): id is string => Boolean(id)),
        );
        return checklistCompleto(itens, marcados);
      })
      .map((lead) => lead.id);
    return { ativo: true, leadIds };
  }

  async painel(user: AuthenticatedUser, leadId: string) {
    const tenantId = this.tenant(user);
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, tenantId },
      select: { id: true, funilId: true, createdAt: true },
    });
    if (!lead) throw new NotFoundException('Lead não encontrado.');
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { cadenciaAtiva: true, checklistAtivo: true },
    });
    const agora = new Date();
    const cadencia = tenant?.cadenciaAtiva
      ? await this.painelCadencia(tenantId, lead.id, lead.createdAt, agora)
      : null;
    const checklist = tenant?.checklistAtivo
      ? await this.painelChecklist(tenantId, lead.id, lead.funilId)
      : null;
    return {
      cadenciaAtiva: Boolean(tenant?.cadenciaAtiva),
      checklistAtivo: Boolean(tenant?.checklistAtivo),
      cadencia,
      checklist,
    };
  }

  async concluirCadencia(user: AuthenticatedUser, leadId: string, etapaId: string) {
    const tenantId = this.tenant(user);
    await this.exigirCadencia(tenantId);
    const lead = await this.leadDoTenant(tenantId, leadId);
    const etapa = await this.etapaDoTenant(user, etapaId);
    const existente = await this.prisma.cadenciaExecucao.findFirst({
      where: { tenantId, leadId: lead.id, etapaId },
    });
    if (!existente) {
      await this.prisma.cadenciaExecucao.create({
        data: {
          tenantId,
          leadId: lead.id,
          etapaId,
          dia: etapa.dia,
          acao: etapa.acao,
          descricao: etapa.descricao,
          autorId: user.id,
        },
      });
    }
    return this.painel(user, leadId);
  }

  async desfazerCadencia(user: AuthenticatedUser, leadId: string, etapaId: string) {
    const tenantId = this.tenant(user);
    await this.leadDoTenant(tenantId, leadId);
    await this.prisma.cadenciaExecucao.deleteMany({
      where: { tenantId, leadId, etapaId },
    });
    return this.painel(user, leadId);
  }

  async marcarChecklist(user: AuthenticatedUser, leadId: string, itemId: string, feito: boolean) {
    const tenantId = this.tenant(user);
    await this.exigirChecklist(tenantId);
    const lead = await this.leadDoTenant(tenantId, leadId);
    const item = await this.itemDoTenant(user, itemId);
    if (feito) {
      const existe = await this.prisma.checklistMarcacao.findFirst({
        where: { tenantId, leadId: lead.id, itemId },
      });
      if (!existe) {
        await this.prisma.checklistMarcacao.create({
          data: {
            tenantId,
            leadId: lead.id,
            itemId,
            texto: item.texto,
            obrigatorio: item.obrigatorio,
            autorId: user.id,
          },
        });
      }
    } else {
      await this.prisma.checklistMarcacao.deleteMany({
        where: { tenantId, leadId: lead.id, itemId },
      });
    }
    return this.painel(user, leadId);
  }

  private async painelCadencia(tenantId: string, leadId: string, inicio: Date, agora: Date) {
    const [etapas, execucoes] = await Promise.all([
      this.prisma.cadenciaEtapa.findMany({ where: { tenantId }, orderBy: { ordem: 'asc' } }),
      this.prisma.cadenciaExecucao.findMany({ where: { tenantId, leadId }, orderBy: { concluidaEm: 'asc' } }),
    ]);
    const porEtapa = new Map(execucoes.filter((item) => item.etapaId).map((item) => [item.etapaId as string, item]));
    return {
      etapas: etapas.map((etapa) => {
        const feita = porEtapa.get(etapa.id);
        return {
          ...etapa,
          ...statusCadencia(
            etapa,
            inicio,
            feita
              ? {
                  etapaId: feita.etapaId,
                  dia: feita.dia,
                  acao: feita.acao,
                  concluidaEm: feita.concluidaEm.toISOString(),
                }
              : undefined,
            agora,
          ),
        };
      }),
      historico: execucoes
        .filter((item) => !item.etapaId || !porEtapa.has(item.etapaId))
        .map((item) => ({
          id: item.id,
          dia: item.dia,
          acao: item.acao,
          descricao: item.descricao,
          concluidaEm: item.concluidaEm.toISOString(),
        })),
    };
  }

  private async painelChecklist(tenantId: string, leadId: string, funilId: string) {
    const [modelos, marcacoes] = await Promise.all([
      this.prisma.checklistModelo.findMany({
        where: { tenantId, OR: [{ funilId: null }, { funilId }] },
        orderBy: { ordem: 'asc' },
        include: { itens: { orderBy: { ordem: 'asc' } } },
      }),
      this.prisma.checklistMarcacao.findMany({ where: { tenantId, leadId } }),
    ]);
    const marcados = new Set(marcacoes.map((item) => item.itemId).filter((id): id is string => Boolean(id)));
    const itens = modelos.flatMap((modelo) => modelo.itens);
    return {
      completo: checklistCompleto(itens, marcados),
      modelos: modelos.map((modelo) => ({
        id: modelo.id,
        nome: modelo.nome,
        itens: modelo.itens.map((item) => ({
          ...item,
          feito: marcados.has(item.id),
        })),
      })),
    };
  }

  private itensAplicaveis(
    modelos: { funilId: string | null; itens: ItemChecklist[] }[],
    funilId: string,
  ) {
    return modelos
      .filter((modelo) => !modelo.funilId || modelo.funilId === funilId)
      .flatMap((modelo) => modelo.itens);
  }

  private async exigirCadencia(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { cadenciaAtiva: true },
    });
    if (!tenant?.cadenciaAtiva) {
      throw new BadRequestException('A cadência está desativada nesta imobiliária.');
    }
  }

  private async exigirChecklist(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { checklistAtivo: true },
    });
    if (!tenant?.checklistAtivo) {
      throw new BadRequestException('O checklist está desativado nesta imobiliária.');
    }
  }

  private async leadDoTenant(tenantId: string, leadId: string) {
    const lead = await this.prisma.lead.findFirst({ where: { id: leadId, tenantId } });
    if (!lead) throw new NotFoundException('Lead não encontrado.');
    return lead;
  }

  private async etapaDoTenant(user: AuthenticatedUser, id: string) {
    const etapa = await this.prisma.cadenciaEtapa.findFirst({
      where: { id, tenantId: this.tenant(user) },
    });
    if (!etapa) throw new NotFoundException('Etapa da cadência não encontrada.');
    return etapa;
  }

  private async modeloDoTenant(user: AuthenticatedUser, id: string) {
    const modelo = await this.prisma.checklistModelo.findFirst({
      where: { id, tenantId: this.tenant(user) },
    });
    if (!modelo) throw new NotFoundException('Checklist não encontrado.');
    return modelo;
  }

  private async itemDoTenant(user: AuthenticatedUser, id: string) {
    const item = await this.prisma.checklistItem.findFirst({
      where: { id, modelo: { tenantId: this.tenant(user) } },
    });
    if (!item) throw new NotFoundException('Item do checklist não encontrado.');
    return item;
  }

  private async funilDoTenant(tenantId: string, funilId?: string | null) {
    if (!funilId) return;
    const funil = await this.prisma.funil.findFirst({ where: { id: funilId, tenantId } });
    if (!funil) throw new BadRequestException('Funil não encontrado nesta imobiliária.');
  }
}
