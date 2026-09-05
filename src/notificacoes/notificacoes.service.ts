import { Injectable, NotFoundException } from '@nestjs/common';
import { NotificacaoTipo, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';

const notifSelect = {
  id: true,
  tipo: true,
  titulo: true,
  corpo: true,
  lida: true,
  leadId: true,
  analiseId: true,
  agendamentoId: true,
  empreendimentoId: true,
  propostaId: true,
  createdAt: true,
} satisfies Prisma.NotificacaoSelect;

@Injectable()
export class NotificacoesService {
  constructor(private readonly prisma: PrismaService) {}

  list(requester: AuthenticatedUser) {
    return this.prisma.notificacao.findMany({
      where: { userId: requester.id },
      select: notifSelect,
      orderBy: [{ lida: 'asc' }, { createdAt: 'desc' }],
      take: 50,
    });
  }

  async markRead(id: string, requester: AuthenticatedUser) {
    const item = await this.prisma.notificacao.findFirst({
      where: { id, userId: requester.id },
      select: { id: true },
    });
    if (!item) {
      throw new NotFoundException('Notificação não encontrada.');
    }
    return this.prisma.notificacao.update({
      where: { id },
      data: { lida: true },
      select: notifSelect,
    });
  }

  async markAllRead(requester: AuthenticatedUser) {
    await this.prisma.notificacao.updateMany({
      where: { userId: requester.id, lida: false },
      data: { lida: true },
    });
    return { ok: true };
  }

  /**
   * Resolve o tenant do destinatário a partir do próprio usuário — necessário
   * porque estes helpers são chamados por outros services sem o requester.
   */
  private async resolveTenantId(userId: string): Promise<string> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { tenantId: true },
    });
    if (!user.tenantId) {
      throw new Error(
        `Usuário ${userId} sem tenant não pode receber notificações.`,
      );
    }
    return user.tenantId;
  }

  /** Cria aviso de resultado de análise para o corretor dono do lead. */
  async createAnaliseResultado(params: {
    userId: string;
    leadId: string;
    analiseId: string;
    nomeProcesso: string;
    status: 'aprovado' | 'reprovado';
    parecer?: string | null;
  }) {
    const statusLabel =
      params.status === 'aprovado' ? 'aprovada' : 'reprovada';
    const parecer = params.parecer?.trim()
      ? ` Parecer: ${params.parecer.trim().slice(0, 280)}`
      : '';
    const tenantId = await this.resolveTenantId(params.userId);

    return this.prisma.notificacao.create({
      data: {
        tenantId,
        userId: params.userId,
        tipo: NotificacaoTipo.analise_resultado,
        titulo: `Análise ${statusLabel} — ${params.nomeProcesso}`,
        corpo: `O resultado da análise de ${params.nomeProcesso} foi ${statusLabel}.${parecer}`,
        leadId: params.leadId,
        analiseId: params.analiseId,
      },
      select: notifSelect,
    });
  }

  /** Avisa o gerente sobre nova solicitação de agenda do corretor. */
  async createAgendaSolicitacao(params: {
    userId: string;
    agendamentoId: string;
    leadId: string;
    titulo: string;
    autorNome: string;
    quando: string;
  }) {
    const tenantId = await this.resolveTenantId(params.userId);
    return this.prisma.notificacao.create({
      data: {
        tenantId,
        userId: params.userId,
        tipo: NotificacaoTipo.agenda_solicitacao,
        titulo: `Solicitação de agenda — ${params.titulo}`,
        corpo: `${params.autorNome} pediu aprovação para "${params.titulo}" em ${params.quando}.`,
        leadId: params.leadId,
        agendamentoId: params.agendamentoId,
      },
      select: notifSelect,
    });
  }

  /** Avisa o corretor sobre aprovação/recusa da solicitação. */
  async createAgendaResposta(params: {
    userId: string;
    agendamentoId: string;
    leadId?: string | null;
    titulo: string;
    aprovado: boolean;
    motivo?: string;
  }) {
    const motivo =
      !params.aprovado && params.motivo
        ? ` Motivo: ${params.motivo.slice(0, 280)}`
        : '';
    const tenantId = await this.resolveTenantId(params.userId);
    return this.prisma.notificacao.create({
      data: {
        tenantId,
        userId: params.userId,
        tipo: NotificacaoTipo.agenda_resposta,
        titulo: params.aprovado
          ? `Agenda aprovada — ${params.titulo}`
          : `Agenda recusada — ${params.titulo}`,
        corpo: params.aprovado
          ? `Sua solicitação "${params.titulo}" foi aprovada pelo gerente.`
          : `Sua solicitação "${params.titulo}" foi recusada.${motivo}`,
        leadId: params.leadId ?? null,
        agendamentoId: params.agendamentoId,
      },
      select: notifSelect,
    });
  }

  /** Lembrete de compromisso próximo (1 dia / 2h / 1h). Idempotente por tipo+agendamento. */
  async createAgendaLembrete(params: {
    userId: string;
    agendamentoId: string;
    leadId?: string | null;
    titulo: string;
    quando: string;
    /** Ex.: " — Cliente: X · Corretor: Y · Gerente: Z" */
    envolvidos?: string;
    /** Tom neutro para admin (sem sugerir que o compromisso é dele). */
    tomInformativo?: boolean;
    tipo:
      | typeof NotificacaoTipo.agenda_lembrete_1d
      | typeof NotificacaoTipo.agenda_lembrete_2h
      | typeof NotificacaoTipo.agenda_lembrete_1h;
  }) {
    const existing = await this.prisma.notificacao.findFirst({
      where: {
        userId: params.userId,
        agendamentoId: params.agendamentoId,
        tipo: params.tipo,
      },
      select: { id: true },
    });
    if (existing) return null;

    const janela =
      params.tipo === NotificacaoTipo.agenda_lembrete_1h
        ? '1 hora'
        : params.tipo === NotificacaoTipo.agenda_lembrete_2h
          ? '2 horas'
          : '1 dia';

    const envolvidos = params.envolvidos?.trim() ?? '';
    const titulo = params.tomInformativo
      ? `Agenda da equipe — ${params.titulo}`
      : `Lembrete (${janela}) — ${params.titulo}`;
    const corpo = params.tomInformativo
      ? `Aviso informativo: compromisso da equipe "${params.titulo}"${envolvidos} em ${params.quando}.`
      : `Seu compromisso "${params.titulo}"${envolvidos} começa em ${params.quando}.`;

    const tenantId = await this.resolveTenantId(params.userId);

    return this.prisma.notificacao.create({
      data: {
        tenantId,
        userId: params.userId,
        tipo: params.tipo,
        titulo,
        corpo,
        leadId: params.leadId ?? null,
        agendamentoId: params.agendamentoId,
      },
      select: notifSelect,
    });
  }

  /**
   * Alerta de prazo do lead. Idempotente por usuário + lead + tipo + eventoChave
   * (ex.: entrada na etapa + deadline), para não repetir a cada polling.
   */
  async createLeadPrazoAlerta(params: {
    userId: string;
    leadId: string;
    leadNome: string;
    eventoChave: string;
    tipo:
      | typeof NotificacaoTipo.lead_prazo_proximo
      | typeof NotificacaoTipo.lead_prazo_ultrapassado;
    detalhe: string;
  }) {
    const existing = await this.prisma.notificacao.findFirst({
      where: {
        userId: params.userId,
        leadId: params.leadId,
        tipo: params.tipo,
        eventoChave: params.eventoChave,
      },
      select: { id: true },
    });
    if (existing) return null;

    const tenantId = await this.resolveTenantId(params.userId);
    const proximo = params.tipo === NotificacaoTipo.lead_prazo_proximo;
    return this.prisma.notificacao.create({
      data: {
        tenantId,
        userId: params.userId,
        tipo: params.tipo,
        titulo: proximo
          ? `Prazo próximo do vencimento — ${params.leadNome}`
          : `Prazo da etapa ultrapassado — ${params.leadNome}`,
        corpo: params.detalhe,
        leadId: params.leadId,
        eventoChave: params.eventoChave,
      },
      select: notifSelect,
    });
  }

    /** Avisa o corretor sobre tarefa atribuída na agenda por gerente/admin. */
  async createAgendaAtribuicao(params: {
    userId: string;
    agendamentoId: string;
    titulo: string;
    autorNome: string;
    quando: string;
  }) {
    const tenantId = await this.resolveTenantId(params.userId);
    return this.prisma.notificacao.create({
      data: {
        tenantId,
        userId: params.userId,
        tipo: NotificacaoTipo.agenda_atribuicao,
        titulo: `Nova tarefa na sua agenda — ${params.titulo}`,
        corpo: `${params.autorNome} atribuiu a tarefa "${params.titulo}" para ${params.quando}.`,
        agendamentoId: params.agendamentoId,
      },
      select: notifSelect,
    });
  }

  /**
   * Tarefa atrasada. Idempotente por usuário + agendamento.
   * Destinatários: corretor, gerente da equipe e administradores.
   */
  async createTarefaAtrasada(params: {
    userId: string;
    leadId: string | null;
    agendamentoId: string;
    leadNome: string;
    titulo: string;
    prazoLabel: string;
  }) {
    const existing = await this.prisma.notificacao.findFirst({
      where: {
        userId: params.userId,
        agendamentoId: params.agendamentoId,
        tipo: NotificacaoTipo.tarefa_atrasada,
      },
      select: { id: true },
    });
    if (existing) return null;

    const tenantId = await this.resolveTenantId(params.userId);
    const contato = params.leadNome ? ` do contato ${params.leadNome}` : '';
    return this.prisma.notificacao.create({
      data: {
        tenantId,
        userId: params.userId,
        tipo: NotificacaoTipo.tarefa_atrasada,
        titulo: `Tarefa atrasada — ${params.titulo}`,
        corpo: `A tarefa "${params.titulo}"${contato} ultrapassou o prazo (${params.prazoLabel}) sem conclusão.`,
        leadId: params.leadId,
        agendamentoId: params.agendamentoId,
        eventoChave: params.agendamentoId,
      },
      select: notifSelect,
    });
  }

  /**
   * Match de imóvel compatível com a carteira do corretor.
   * Idempotente por usuário + empreendimento + eventoChave.
   */
  async createImovelCompativel(params: {
    userId: string;
    empreendimentoId: string;
    empreendimentoNome: string;
    total: number;
    muitoCompativeis: number;
    comInteressePrevio: number;
    eventoChave: string;
  }) {
    const existing = await this.prisma.notificacao.findFirst({
      where: {
        userId: params.userId,
        empreendimentoId: params.empreendimentoId,
        tipo: NotificacaoTipo.imovel_compativel,
        eventoChave: params.eventoChave,
      },
      select: { id: true },
    });
    if (existing) return null;

    const tenantId = await this.resolveTenantId(params.userId);
    const partes = [
      `${params.total} cliente${params.total === 1 ? '' : 's'} compatível${params.total === 1 ? '' : 'eis'}`,
      `${params.muitoCompativeis} muito compatível${params.muitoCompativeis === 1 ? '' : 'eis'}`,
    ];
    if (params.comInteressePrevio > 0) {
      partes.push(
        `${params.comInteressePrevio} com interesse prévio em imóveis semelhantes`,
      );
    }

    return this.prisma.notificacao.create({
      data: {
        tenantId,
        userId: params.userId,
        tipo: NotificacaoTipo.imovel_compativel,
        titulo: `Novos matches — ${params.empreendimentoNome}`,
        corpo: `Imóvel "${params.empreendimentoNome}": ${partes.join('; ')}.`,
        empreendimentoId: params.empreendimentoId,
        eventoChave: params.eventoChave,
      },
      select: notifSelect,
    });
  }

  /**
   * Lead parado sem atendimento (inatividade do funil).
   * Idempotente por usuário + lead + lastMovementAt.
   */
  async createLeadSemAtendimento(params: {
    userId: string;
    leadId: string;
    leadNome: string;
    eventoChave: string;
    detalhe: string;
  }) {
    const existing = await this.prisma.notificacao.findFirst({
      where: {
        userId: params.userId,
        leadId: params.leadId,
        tipo: NotificacaoTipo.lead_sem_atendimento,
        eventoChave: params.eventoChave,
      },
      select: { id: true },
    });
    if (existing) return null;

    const tenantId = await this.resolveTenantId(params.userId);
    return this.prisma.notificacao.create({
      data: {
        tenantId,
        userId: params.userId,
        tipo: NotificacaoTipo.lead_sem_atendimento,
        titulo: `Lead sem atendimento — ${params.leadNome}`,
        corpo: params.detalhe,
        leadId: params.leadId,
        eventoChave: params.eventoChave,
      },
      select: notifSelect,
    });
  }

  /**
   * Proposta com validade próxima. Idempotente por usuário + proposta + validade.
   */
  async createPropostaVencimentoProximo(params: {
    userId: string;
    propostaId: string;
    codigo: string;
    clienteNome: string;
    validadeLabel: string;
    leadId?: string | null;
    eventoChave: string;
  }) {
    const existing = await this.prisma.notificacao.findFirst({
      where: {
        userId: params.userId,
        propostaId: params.propostaId,
        tipo: NotificacaoTipo.proposta_vencimento_proximo,
        eventoChave: params.eventoChave,
      },
      select: { id: true },
    });
    if (existing) return null;

    const tenantId = await this.resolveTenantId(params.userId);
    return this.prisma.notificacao.create({
      data: {
        tenantId,
        userId: params.userId,
        tipo: NotificacaoTipo.proposta_vencimento_proximo,
        titulo: `Proposta próxima do vencimento — ${params.codigo}`,
        corpo: `A proposta ${params.codigo} de ${params.clienteNome} vence em ${params.validadeLabel}.`,
        propostaId: params.propostaId,
        leadId: params.leadId ?? null,
        eventoChave: params.eventoChave,
      },
      select: notifSelect,
    });
  }
}
