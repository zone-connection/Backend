import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  AgendamentoAlvo,
  AgendamentoEscopo,
  AgendamentoHistoricoAcao,
  AgendamentoRecurrenceFreq,
  AgendamentoSolicitacaoStatus,
  AgendamentoStatus,
  AgendamentoTipo,
  CatalogType,
  MuralChaveStatus,
  NotificacaoTipo,
  Prisma,
  Role,
  TriagemOrigem,
  UserStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TeamScopeService } from '../equipes/team-scope.service';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { LeadMonitoramentoService } from '../leads/monitoramento/lead-monitoramento.service';
import { GoogleCalendarService } from '../google-calendar/google-calendar.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { resolveFinanceiroTenantId as requireTenantId } from '../common/utils/tenant';
import { isCorretorLike } from '../common/utils/roles';
import { CreateAgendamentoDto } from './dto/create-agendamento.dto';
import { UpdateAgendamentoDto } from './dto/update-agendamento.dto';
import { QueryAgendamentoDto } from './dto/query-agendamento.dto';
import { QueryDisponibilidadeDto } from './dto/query-disponibilidade.dto';
import {
  janelaVisita,
  janelasConflitam,
  mesmoRecursoVisita,
} from './visita-disponibilidade';

const MAX_RECURRENCE_OCCURRENCES = 366;

/** Etapas anteriores a "visita-agendada" — ao confirmar visita, avançamos o funil. */
const STAGES_BEFORE_VISITA = new Set([
  'novo',
  'contato',
  'qualificacao',
  'em-analise',
]);

const agendamentoSelect = {
  id: true,
  tenantId: true,
  leadId: true,
  autorId: true,
  atribuidoParaId: true,
  titulo: true,
  tipo: true,
  status: true,
  escopo: true,
  solicitacaoStatus: true,
  alvoTipo: true,
  alvoEquipeId: true,
  alvoGerenteId: true,
  seriesId: true,
  recurrenceFreq: true,
  recurrenceDays: true,
  recurrenceUntil: true,
  startsAt: true,
  endsAt: true,
  local: true,
  observacoes: true,
  funilStage: true,
  contaAtraso: true,
  empreendimentoId: true,
  imovelId: true,
  toleranciaAtiva: true,
  bloqueadoAte: true,
  muralChaveId: true,
  chaveRetiradaEm: true,
  motivoRecusa: true,
  origemTarefa: true,
  aprovadoAt: true,
  createdAt: true,
  updatedAt: true,
  autor: { select: { id: true, name: true, role: true } },
  atribuidoPara: { select: { id: true, name: true, role: true } },
  aprovadoPor: { select: { id: true, name: true } },
  alvoEquipe: { select: { id: true, name: true } },
  alvoGerente: { select: { id: true, name: true } },
  lead: {
    select: {
      id: true,
      tipo: true,
      nome: true,
      telefone: true,
      stage: true,
      corretorId: true,
      corretor: { select: { id: true, name: true } },
    },
  },
  empreendimento: { select: { id: true, nome: true } },
  imovel: {
    select: {
      id: true,
      logradouro: true,
      numero: true,
      bairro: true,
      cidade: true,
    },
  },
  muralChave: { select: { id: true, identificador: true, status: true } },
} as const;

const ANIVERSARIO_ID_PREFIX = 'aniversario:';

type AgendamentoListItem = Prisma.AgendamentoGetPayload<{
  select: typeof agendamentoSelect;
}> & { isAniversario?: boolean };

function isAniversarioId(id: string) {
  return id.startsWith(ANIVERSARIO_ID_PREFIX);
}

@Injectable()
export class AgendaService {
  private readonly logger = new Logger(AgendaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly teamScope: TeamScopeService,
    private readonly notificacoes: NotificacoesService,
    private readonly monitoramento: LeadMonitoramentoService,
    private readonly googleCalendar: GoogleCalendarService,
  ) {}

  /** Compromissos no calendário/tabela.
   * - eventos do admin: conforme alvoTipo (todos / equipe / gerente / gerentes)
   * - pessoal: só o autor
   * - com_gerente aprovado: autor + gerente/admin da equipe
   * - com_gerente pendente: corretor autor ainda vê no calendário
   */
  async list(
    query: QueryAgendamentoDto,
    requester: AuthenticatedUser,
  ): Promise<AgendamentoListItem[]> {
    const tenantId = requireTenantId(requester);
    const visitasDoRecurso = await this.listarVisitasDoRecurso(tenantId, query);
    if (visitasDoRecurso) return visitasDoRecurso;

    if (requester.role === Role.super_admin) {
      const where: Prisma.AgendamentoWhereInput = {
        tenantId,
        autorId: requester.id,
      };
      if (query.tipo) where.tipo = query.tipo;
      if (query.status) where.status = query.status;
      if (query.from || query.to) {
        where.startsAt = {};
        if (query.from) where.startsAt.gte = new Date(query.from);
        if (query.to) where.startsAt.lte = new Date(query.to);
      }

      return this.prisma.agendamento.findMany({
        where,
        select: agendamentoSelect,
        orderBy: { startsAt: 'asc' },
      });
    }

    const sharedAccess = await this.buildSharedAccessFilter(
      requester,
      query.corretorId,
      query.equipeId,
    );
    if (!sharedAccess) return [];

    const viewTarget = query.corretorId
      ? await this.resolveAgendaViewTarget(query.corretorId, requester)
      : null;

    const adminEventVisibility = viewTarget
      ? await this.buildAdminEventVisibilityForUser(viewTarget)
      : await this.buildAdminEventVisibility(requester, query.equipeId);

    const gerenteBloqueioVisibility = viewTarget
      ? isCorretorLike(viewTarget.role)
        ? await this.buildGerenteBloqueioVisibilityForCorretor(viewTarget.id)
        : null
      : await this.buildGerenteBloqueioVisibility(requester, query.corretorId);

    const visibilityOr: Prisma.AgendamentoWhereInput[] = viewTarget
      ? [
          // Agenda do usuário: pessoais, bloqueios e com_gerente que ele criou.
          {
            autorId: viewTarget.id,
            alvoTipo: AgendamentoAlvo.nenhum,
          },
          {
            atribuidoParaId: viewTarget.id,
            alvoTipo: AgendamentoAlvo.nenhum,
          },
          ...(adminEventVisibility ? [adminEventVisibility] : []),
          ...(gerenteBloqueioVisibility ? [gerenteBloqueioVisibility] : []),
        ]
      : [
          ...(adminEventVisibility ? [adminEventVisibility] : []),
          {
            escopo: AgendamentoEscopo.pessoal,
            autorId: requester.id,
            alvoTipo: AgendamentoAlvo.nenhum,
          },
          {
            atribuidoParaId: requester.id,
            alvoTipo: AgendamentoAlvo.nenhum,
          },
          ...(gerenteBloqueioVisibility ? [gerenteBloqueioVisibility] : []),
          {
            AND: [
              {
                escopo: AgendamentoEscopo.com_gerente,
                solicitacaoStatus: AgendamentoSolicitacaoStatus.aprovada,
                alvoTipo: AgendamentoAlvo.nenhum,
              },
              sharedAccess,
            ],
          },
          ...(isCorretorLike(requester.role)
            ? [
                {
                  autorId: requester.id,
                  escopo: AgendamentoEscopo.com_gerente,
                  solicitacaoStatus: AgendamentoSolicitacaoStatus.pendente,
                  alvoTipo: AgendamentoAlvo.nenhum,
                },
              ]
            : []),
        ];

    const where: Prisma.AgendamentoWhereInput = {
      tenantId,
      AND: [{ OR: visibilityOr }],
    };

    if (query.tipo) where.tipo = query.tipo;
    if (query.status) where.status = query.status;

    if (query.from || query.to) {
      where.startsAt = {};
      if (query.from) where.startsAt.gte = new Date(query.from);
      if (query.to) where.startsAt.lte = new Date(query.to);
    }

    const rows: AgendamentoListItem[] =
      await this.prisma.agendamento.findMany({
        where,
        select: agendamentoSelect,
        orderBy: { startsAt: 'asc' },
      });

    const aniversarios = await this.buildUsuarioAniversarios({
      tenantId,
      requester,
      from: query.from ? new Date(query.from) : null,
      to: query.to ? new Date(query.to) : null,
      tipo: query.tipo,
      status: query.status,
      equipeId: query.equipeId,
      corretorId: query.corretorId,
    });

    if (aniversarios.length === 0) return rows;

    return [...rows, ...aniversarios].sort(
      (a, b) =>
        new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
    );
  }

  /** Visitas de um imóvel ou empreendimento, na mesma agenda do calendário. */
  private async listarVisitasDoRecurso(
    tenantId: string,
    query: QueryAgendamentoDto,
  ): Promise<AgendamentoListItem[] | null> {
    const empreendimentoId = query.empreendimentoId?.trim() || null;
    const imovelId = query.imovelId?.trim() || null;
    if (!empreendimentoId && !imovelId) return null;

    const where: Prisma.AgendamentoWhereInput = {
      tenantId,
      tipo: AgendamentoTipo.visita,
      status: query.status ?? { not: AgendamentoStatus.cancelado },
      ...(imovelId && empreendimentoId
        ? {
            OR: [{ imovelId }, { empreendimentoId, imovelId: null }],
          }
        : empreendimentoId
          ? { empreendimentoId }
          : { imovelId }),
    };
    if (query.from || query.to) {
      where.startsAt = {};
      if (query.from) where.startsAt.gte = new Date(query.from);
      if (query.to) where.startsAt.lte = new Date(query.to);
    }

    return this.prisma.agendamento.findMany({
      where,
      select: agendamentoSelect,
      orderBy: { startsAt: 'asc' },
    });
  }

  /** Solicitações pendentes: gerente aprova da equipe; corretor acompanha as próprias. Admin não recebe. */
  async listSolicitacoes(requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);
    // Pedidos corretor → gerente são só do gerente da equipe; admin não entra na fila.
    if (requester.role === Role.admin) {
      return [];
    }

    const sharedAccess = await this.buildSharedAccessFilter(requester);
    if (!sharedAccess) return [];

    const where: Prisma.AgendamentoWhereInput = {
      tenantId,
      AND: [
        sharedAccess,
        {
          escopo: AgendamentoEscopo.com_gerente,
          solicitacaoStatus: AgendamentoSolicitacaoStatus.pendente,
          status: { not: AgendamentoStatus.cancelado },
        },
      ],
    };

    if (isCorretorLike(requester.role)) {
      where.autorId = requester.id;
    }

    return this.prisma.agendamento.findMany({
      where,
      select: agendamentoSelect,
      orderBy: { startsAt: 'asc' },
    });
  }

  async countSolicitacoes(requester: AuthenticatedUser) {
    const items = await this.listSolicitacoes(requester);
    return { count: items.length };
  }

  /**
   * Cards do topo da Agenda: hoje vs ontem, no fuso de São Paulo.
   */
  async kpis(
    requester: AuthenticatedUser,
    filters?: { corretorId?: string; equipeId?: string },
  ) {
    const { start: todayStart, end: todayEnd } = saoPauloDayBounds();
    const yesterdayStart = new Date(todayStart.getTime() - 86_400_000);

    const items = await this.list(
      {
        from: yesterdayStart.toISOString(),
        to: new Date(todayEnd.getTime() - 1).toISOString(),
        corretorId: filters?.corretorId,
        equipeId: filters?.equipeId,
      },
      requester,
    );

    const inRange = (
      from: Date,
      to: Date,
      match: (item: AgendamentoListItem) => boolean,
    ) =>
      items.filter((item) => {
        if (item.status === AgendamentoStatus.cancelado) return false;
        const at = new Date(item.startsAt).getTime();
        return at >= from.getTime() && at < to.getTime() && match(item);
      }).length;

    const isProposta = (item: AgendamentoListItem) =>
      item.tipo === AgendamentoTipo.tarefa ||
      /proposta/i.test(item.titulo ?? '');

    const card = (match: (item: AgendamentoListItem) => boolean) => ({
      hoje: inRange(todayStart, todayEnd, match),
      ontem: inRange(yesterdayStart, todayStart, match),
    });

    return {
      compromissos: card(() => true),
      atendimentos: card((item) => item.tipo === AgendamentoTipo.ligacao),
      reunioes: card((item) => item.tipo === AgendamentoTipo.reuniao),
      propostas: card(isProposta),
      visitas: card((item) => item.tipo === AgendamentoTipo.visita),
    };
  }

  /**
   * Sincroniza lembretes (1d / 2h / 1h) e retorna alerta para badge + card.
   * Chamado no login/polling do front — sem cron no servidor.
   */
  async syncLembretes(requester: AuthenticatedUser) {
    // Analista não usa agenda operacional — evita 403 no shell e vazamento de solicitações.
    if (requester.role === Role.analista) {
      return {
        urgencia: 'nenhuma' as const,
        proximosCount: 0,
        solicitacoesCount: 0,
        proximos: [],
        novasNotificacoes: [],
      };
    }

    const now = new Date();
    const horizon = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const MS_1H = 60 * 60 * 1000;
    const MS_2H = 2 * MS_1H;
    const MS_1D = 24 * MS_1H;

    const upcoming = (
      await this.list(
        {
          status: AgendamentoStatus.agendado,
          from: now.toISOString(),
          to: horizon.toISOString(),
        },
        requester,
      )
    ).filter(
      (item) =>
        !item.isAniversario &&
        !isAniversarioId(item.id) &&
        item.tipo !== AgendamentoTipo.bloqueio &&
        !item.origemTarefa,
    );

    const corretorIds = Array.from(
      new Set(
        upcoming
          .map((item) => {
            if (item.lead?.corretorId) return item.lead.corretorId;
            if (isCorretorLike(item.autor.role)) return item.autorId;
            return null;
          })
          .filter((id): id is string => Boolean(id)),
      ),
    );
    const equipeInfoByCorretorId =
      await this.resolveEquipeInfoByCorretorIds(corretorIds);

    // Gerentes autores: resolve a equipe que lideram.
    const gerenteAutorIds = Array.from(
      new Set(
        upcoming
          .filter((i) => i.autor.role === Role.gerente)
          .map((i) => i.autorId),
      ),
    );
    const equipeByGerenteId =
      await this.resolveEquipeByGerenteIds(gerenteAutorIds);

    type Urgencia = 'nenhuma' | 'dia' | 'duas_horas' | 'uma_hora';
    let urgencia: Urgencia = 'nenhuma';

    const proximos = upcoming.map((item) => {
      const startsAt = new Date(item.startsAt);
      const msRestante = startsAt.getTime() - now.getTime();
      let nivel: 'dia' | 'duas_horas' | 'uma_hora' = 'dia';
      if (msRestante <= MS_1H) nivel = 'uma_hora';
      else if (msRestante <= MS_2H) nivel = 'duas_horas';

      if (nivel === 'uma_hora') urgencia = 'uma_hora';
      else if (nivel === 'duas_horas' && urgencia !== 'uma_hora') {
        urgencia = 'duas_horas';
      } else if (urgencia === 'nenhuma') {
        urgencia = 'dia';
      }

      const corretorId =
        item.lead?.corretorId ??
        (isCorretorLike(item.autor.role) ? item.autorId : null);
      const corretorNome =
        item.lead?.corretor?.name ??
        (isCorretorLike(item.autor.role) ? item.autor.name : null);
      const info = corretorId
        ? equipeInfoByCorretorId.get(corretorId)
        : undefined;
      const equipeDoGerente =
        item.autor.role === Role.gerente
          ? equipeByGerenteId.get(item.autorId)
          : undefined;
      const equipeNome =
        info?.equipeNome ??
        equipeDoGerente?.name ??
        item.alvoEquipe?.name ??
        null;
      const publicoLabel =
        item.alvoTipo === AgendamentoAlvo.todos
          ? 'Todas as equipes'
          : item.alvoTipo === AgendamentoAlvo.equipe
            ? item.alvoEquipe?.name
              ? `Equipe: ${item.alvoEquipe.name}`
              : 'Uma equipe'
            : item.alvoTipo === AgendamentoAlvo.gerente
              ? item.alvoGerente?.name
                ? `Gerente: ${item.alvoGerente.name}`
                : 'Um gerente'
              : item.alvoTipo === AgendamentoAlvo.gerentes
                ? 'Todos os gerentes'
                : null;

      return {
        id: item.id,
        titulo: item.titulo,
        startsAt: item.startsAt,
        local: item.local,
        leadNome: item.lead?.nome ?? null,
        leadTipo: item.lead?.tipo ?? null,
        corretorNome,
        gerenteNome:
          (info?.gerenteNome ? info.gerenteNome : null) ??
          (item.autor.role === Role.gerente ? item.autor.name : null) ??
          item.alvoGerente?.name ??
          null,
        equipeNome,
        publicoLabel,
        autorNome: item.autor.name,
        autorRole: item.autor.role,
        nivel,
        msRestante,
      };
    });

    const criadas: Array<{
      id: string;
      tipo: NotificacaoTipo;
      titulo: string;
      corpo: string;
    }> = [];

    const tomInformativo = requester.role === Role.admin;

    for (const item of upcoming) {
      const startsAt = new Date(item.startsAt);
      const msRestante = startsAt.getTime() - now.getTime();
      if (msRestante <= 0) continue;

      const quando = startsAt.toLocaleString('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
      });

      const proximo = proximos.find((p) => p.id === item.id);
      const envolvidos: string[] = [];
      if (proximo?.publicoLabel) {
        envolvidos.push(proximo.publicoLabel);
      }
      if (proximo?.leadNome) {
        envolvidos.push(
          `${proximo.leadTipo === 'cliente' ? 'Cliente' : 'Lead'}: ${proximo.leadNome}`,
        );
      }
      if (proximo?.corretorNome) {
        envolvidos.push(`Corretor: ${proximo.corretorNome}`);
      }
      if (proximo?.gerenteNome && !proximo.publicoLabel?.startsWith('Gerente:')) {
        envolvidos.push(`Gerente: ${proximo.gerenteNome}`);
      }
      if (proximo?.equipeNome && !proximo.publicoLabel?.startsWith('Equipe:')) {
        envolvidos.push(`Equipe: ${proximo.equipeNome}`);
      }
      const envolvidosTxt =
        envolvidos.length > 0 ? ` — ${envolvidos.join(' · ')}` : '';

      const janelas: Array<{
        maxMs: number;
        tipo:
          | typeof NotificacaoTipo.agenda_lembrete_1d
          | typeof NotificacaoTipo.agenda_lembrete_2h
          | typeof NotificacaoTipo.agenda_lembrete_1h;
      }> = [
        { maxMs: MS_1D, tipo: NotificacaoTipo.agenda_lembrete_1d },
        { maxMs: MS_2H, tipo: NotificacaoTipo.agenda_lembrete_2h },
        { maxMs: MS_1H, tipo: NotificacaoTipo.agenda_lembrete_1h },
      ];

      for (const janela of janelas) {
        if (msRestante > janela.maxMs) continue;
        const created = await this.notificacoes.createAgendaLembrete({
          userId: requester.id,
          agendamentoId: item.id,
          leadId: item.leadId,
          titulo: item.titulo,
          quando,
          envolvidos: envolvidosTxt || undefined,
          tomInformativo,
          tipo: janela.tipo,
        });
        if (created) {
          criadas.push({
            id: created.id,
            tipo: created.tipo,
            titulo: created.titulo,
            corpo: created.corpo,
          });
        }
      }
    }

    const solicitacoes = await this.countSolicitacoes(requester);

    return {
      urgencia,
      proximosCount: proximos.length,
      solicitacoesCount: solicitacoes.count,
      proximos,
      novasNotificacoes: criadas.filter(Boolean),
    };
  }

  async findOne(id: string, requester: AuthenticatedUser) {
    if (isAniversarioId(id)) {
      throw new NotFoundException(
        'Aniversários são somente leitura e não podem ser abertos como compromisso.',
      );
    }
    const tenantId = requireTenantId(requester);
    const item = await this.prisma.agendamento.findFirst({
      where: { id, tenantId },
      select: agendamentoSelect,
    });
    if (!item) {
      throw new NotFoundException('Agendamento não encontrado.');
    }

    await this.ensureAgendamentoAccessible(item, requester);
    return item;
  }

  private chaveWindow(startsAt: Date, endsAt: Date | null) {
    const end = endsAt ?? new Date(startsAt.getTime() + 60 * 60 * 1000);
    return { start: startsAt, end };
  }

  private async assertChaveSemConflito(opts: {
    tenantId: string;
    muralChaveId: string;
    identificador: string;
    startsAt: Date;
    endsAt: Date | null;
    ignoreId?: string;
  }) {
    const window = this.chaveWindow(opts.startsAt, opts.endsAt);
    const candidatos = await this.prisma.agendamento.findMany({
      where: {
        tenantId: opts.tenantId,
        muralChaveId: opts.muralChaveId,
        status: { not: AgendamentoStatus.cancelado },
        ...(opts.ignoreId ? { id: { not: opts.ignoreId } } : {}),
        startsAt: { lt: window.end },
      },
      select: { id: true, startsAt: true, endsAt: true },
    });
    const conflito = candidatos.find((item) => {
      const other = this.chaveWindow(item.startsAt, item.endsAt);
      return other.end > window.start;
    });
    if (conflito) {
      throw new BadRequestException(
        `A chave ${opts.identificador} já está reservada nesse horário.`,
      );
    }
  }

  private horaAgenda(value: Date) {
    return value.toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  private imovelResumo(imovel: {
    logradouro: string;
    numero: string;
    bairro: string;
    cidade: string;
  } | null) {
    if (!imovel) return null;
    const endereco = [imovel.logradouro, imovel.numero].filter(Boolean).join(', ');
    const lugar = [imovel.bairro, imovel.cidade].filter(Boolean).join(' · ');
    return [endereco, lugar].filter(Boolean).join(' — ') || 'Imóvel';
  }

  private async resolveImovelId(tenantId: string, imovelId?: string | null) {
    const id = imovelId?.trim() || null;
    if (!id) return null;
    const imovel = await this.prisma.imovel.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!imovel) throw new BadRequestException('Imóvel não encontrado.');
    return imovel.id;
  }

  private async assertVisitaDisponivel(opts: {
    tenantId: string;
    tipo: AgendamentoTipo;
    empreendimentoId: string | null;
    imovelId: string | null;
    startsAt: Date;
    endsAt: Date | null;
    toleranciaAtiva: boolean;
    ignoreId?: string;
  }): Promise<{ bloqueadoAte: Date | null; toleranciaAtiva: boolean; imovelId: string | null }> {
    if (opts.tipo !== AgendamentoTipo.visita) {
      return { bloqueadoAte: null, toleranciaAtiva: false, imovelId: null };
    }
    const janela = janelaVisita({
      startsAt: opts.startsAt,
      endsAt: opts.endsAt,
      toleranciaAtiva: opts.toleranciaAtiva,
    });
    if (!opts.imovelId && !opts.empreendimentoId) {
      return {
        bloqueadoAte: janela.end,
        toleranciaAtiva: opts.toleranciaAtiva,
        imovelId: null,
      };
    }

    const or: Prisma.AgendamentoWhereInput[] = [];
    if (opts.imovelId) or.push({ imovelId: opts.imovelId });
    if (opts.empreendimentoId) or.push({ empreendimentoId: opts.empreendimentoId });

    const candidatos = await this.prisma.agendamento.findMany({
      where: {
        tenantId: opts.tenantId,
        tipo: AgendamentoTipo.visita,
        status: AgendamentoStatus.agendado,
        ...(opts.ignoreId ? { id: { not: opts.ignoreId } } : {}),
        OR: or,
        startsAt: { lt: janela.end },
      },
      select: {
        id: true,
        titulo: true,
        startsAt: true,
        endsAt: true,
        bloqueadoAte: true,
        toleranciaAtiva: true,
        imovelId: true,
        empreendimentoId: true,
        autor: { select: { name: true } },
        atribuidoPara: { select: { name: true } },
      },
    });

    const recurso = {
      imovelId: opts.imovelId,
      empreendimentoId: opts.empreendimentoId,
    };
    const conflito = candidatos.find((item) => {
      if (
        !mesmoRecursoVisita(recurso, {
          imovelId: item.imovelId,
          empreendimentoId: item.empreendimentoId,
        })
      ) {
        return false;
      }
      const outra = janelaVisita({
        startsAt: item.startsAt,
        endsAt: item.bloqueadoAte ?? item.endsAt,
        toleranciaAtiva: item.bloqueadoAte ? false : item.toleranciaAtiva,
      });
      const fim = item.bloqueadoAte ?? outra.end;
      return janelasConflitam(janela, { start: item.startsAt, end: fim });
    });

    if (conflito) {
      const fim = conflito.bloqueadoAte
        ?? janelaVisita({
          startsAt: conflito.startsAt,
          endsAt: conflito.endsAt,
          toleranciaAtiva: conflito.toleranciaAtiva,
        }).end;
      const corretor = conflito.atribuidoPara?.name ?? conflito.autor.name;
      throw new BadRequestException(
        `Horário indisponível. A visita "${conflito.titulo}" de ${corretor} ocupa este imóvel/empreendimento de ${this.horaAgenda(conflito.startsAt)} até ${this.horaAgenda(fim)}.`,
      );
    }

    return {
      bloqueadoAte: janela.end,
      toleranciaAtiva: opts.toleranciaAtiva,
      imovelId: opts.imovelId,
    };
  }

  private detalheVisita(input: {
    titulo: string;
    startsAt: Date;
    bloqueadoAte: Date | null;
    toleranciaAtiva: boolean;
    corretorNome: string;
    empreendimentoNome?: string | null;
    imovelLabel?: string | null;
  }) {
    const onde =
      [input.empreendimentoNome, input.imovelLabel].filter(Boolean).join(' · ') ||
      'sem imóvel informado';
    const fim = input.bloqueadoAte
      ? this.horaAgenda(input.bloqueadoAte)
      : this.horaAgenda(input.startsAt);
    const tolerancia = input.toleranciaAtiva
      ? 'Tolerância de 2 horas ativada.'
      : 'Sem tolerância de 2 horas.';
    return `${input.titulo}. ${onde}. Corretor ${input.corretorNome}. Horário informado ${this.horaAgenda(input.startsAt)}. Período bloqueado até ${fim}. ${tolerancia}`;
  }

  private async registrarHistoricoVisita(input: {
    tenantId: string;
    agendamentoId: string;
    autorId: string;
    acao: AgendamentoHistoricoAcao;
    detalhe: string;
  }) {
    await this.prisma.agendamentoHistorico.create({
      data: {
        tenantId: input.tenantId,
        agendamentoId: input.agendamentoId,
        autorId: input.autorId,
        acao: input.acao,
        detalhe: input.detalhe,
      },
    });
  }

  async disponibilidadeVisitas(
    query: QueryDisponibilidadeDto,
    requester: AuthenticatedUser,
  ) {
    const tenantId = requireTenantId(requester);
    const empreendimentoId = query.empreendimentoId?.trim() || null;
    const imovelId = query.imovelId?.trim() || null;
    if (!empreendimentoId && !imovelId) {
      throw new BadRequestException(
        'Selecione o empreendimento ou o imóvel para ver a agenda.',
      );
    }
    const from = new Date(query.from);
    const to = new Date(query.to);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) {
      throw new BadRequestException('Período da agenda inválido.');
    }

    const visitas = await this.prisma.agendamento.findMany({
      where: {
        tenantId,
        tipo: AgendamentoTipo.visita,
        status: AgendamentoStatus.agendado,
        ...(imovelId && empreendimentoId
          ? {
              OR: [
                { imovelId },
                { empreendimentoId, imovelId: null },
              ],
            }
          : empreendimentoId
            ? { empreendimentoId }
            : { imovelId: imovelId! }),
        AND: [
          { startsAt: { lt: to } },
          {
            OR: [
              { startsAt: { gte: from } },
              { bloqueadoAte: { gt: from } },
              { endsAt: { gt: from } },
            ],
          },
        ],
      },
      select: agendamentoSelect,
      orderBy: { startsAt: 'asc' },
    });

    const doDia = visitas.filter((item) => {
      const fim = item.bloqueadoAte ?? item.endsAt ?? item.startsAt;
      return fim > from;
    });

    return {
      total: doDia.length,
      visitas: doDia.map((item) => ({
        id: item.id,
        titulo: item.titulo,
        startsAt: item.startsAt,
        endsAt: item.endsAt,
        bloqueadoAte: item.bloqueadoAte,
        toleranciaAtiva: item.toleranciaAtiva,
        corretorNome: item.atribuidoPara?.name ?? item.autor.name,
        empreendimentoId: item.empreendimentoId,
        empreendimentoNome: item.empreendimento?.nome ?? null,
        imovelId: item.imovelId,
        imovelLabel: this.imovelResumo(item.imovel),
      })),
    };
  }

  async historicoVisita(id: string, requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);
    const item = await this.prisma.agendamento.findFirst({
      where: { id, tenantId },
      select: {
        id: true,
        leadId: true,
        autorId: true,
        atribuidoParaId: true,
        tipo: true,
        alvoTipo: true,
        alvoEquipeId: true,
        alvoGerenteId: true,
      },
    });
    if (!item) throw new NotFoundException('Agendamento não encontrado.');
    await this.ensureAgendamentoAccessible(item, requester);
    return this.prisma.agendamentoHistorico.findMany({
      where: { tenantId, agendamentoId: id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        acao: true,
        detalhe: true,
        createdAt: true,
        autor: { select: { id: true, name: true } },
      },
    });
  }

  private async resolveChaveVinculo(opts: {
    tenantId: string;
    tipo: AgendamentoTipo;
    empreendimentoId?: string | null;
    muralChaveId?: string | null;
    startsAt: Date;
    endsAt: Date | null;
    ignoreId?: string;
  }): Promise<{ empreendimentoId: string | null; muralChaveId: string | null }> {
    const vincula =
      opts.tipo === AgendamentoTipo.visita ||
      opts.tipo === AgendamentoTipo.retirada_chave;
    if (!vincula) {
      return { empreendimentoId: null, muralChaveId: null };
    }

    const empreendimentoId = opts.empreendimentoId?.trim() || null;
    const muralChaveId = opts.muralChaveId?.trim() || null;

    if (opts.tipo === AgendamentoTipo.retirada_chave && !muralChaveId) {
      throw new BadRequestException('Selecione a chave da retirada.');
    }

    if (empreendimentoId) {
      const empreendimento = await this.prisma.empreendimento.findFirst({
        where: { id: empreendimentoId, tenantId: opts.tenantId },
        select: { id: true },
      });
      if (!empreendimento) {
        throw new BadRequestException('Empreendimento não encontrado.');
      }
    }

    if (!muralChaveId) {
      return { empreendimentoId, muralChaveId: null };
    }

    const chave = await this.prisma.muralChave.findFirst({
      where: { id: muralChaveId, tenantId: opts.tenantId },
      select: {
        id: true,
        status: true,
        identificador: true,
        empreendimentoId: true,
      },
    });
    if (!chave) {
      throw new BadRequestException('Chave não encontrada.');
    }

    let mesmaReserva = false;
    if (opts.ignoreId) {
      const atual = await this.prisma.agendamento.findFirst({
        where: { id: opts.ignoreId, tenantId: opts.tenantId },
        select: { muralChaveId: true },
      });
      mesmaReserva = atual?.muralChaveId === chave.id;
    }
    if (chave.status === MuralChaveStatus.em_uso && !mesmaReserva) {
      throw new BadRequestException(
        `A chave ${chave.identificador} está em uso. A reserva fica disponível depois da devolução.`,
      );
    }
    if (
      empreendimentoId &&
      chave.empreendimentoId &&
      chave.empreendimentoId !== empreendimentoId
    ) {
      throw new BadRequestException(
        'Esta chave não pertence ao empreendimento selecionado.',
      );
    }

    await this.assertChaveSemConflito({
      tenantId: opts.tenantId,
      muralChaveId: chave.id,
      identificador: chave.identificador,
      startsAt: opts.startsAt,
      endsAt: opts.endsAt,
      ignoreId: opts.ignoreId,
    });

    return {
      empreendimentoId: empreendimentoId ?? chave.empreendimentoId,
      muralChaveId: chave.id,
    };
  }

  async create(dto: CreateAgendamentoDto, requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);
    const isPlatformAgenda = requester.role === Role.super_admin;
    const isBloqueio = dto.tipo === 'bloqueio';
    const atribuidoParaIdRaw = dto.atribuidoParaId?.trim() || null;

    if (isBloqueio && atribuidoParaIdRaw) {
      throw new BadRequestException(
        'Bloqueio de horário não pode ser atribuído a um corretor.',
      );
    }

    if (isBloqueio) {
      if (
        requester.role !== Role.admin &&
        requester.role !== Role.gerente
      ) {
        throw new ForbiddenException(
          'Apenas admin e gerente podem travar horários na agenda.',
        );
      }
    }

    const atribuidoPara = atribuidoParaIdRaw
      ? await this.resolveAtribuidoPara(atribuidoParaIdRaw, requester)
      : null;

    let escopo: AgendamentoEscopo;
    if (isPlatformAgenda || isBloqueio || atribuidoPara) {
      escopo = AgendamentoEscopo.pessoal;
    } else {
      escopo = dto.escopo as AgendamentoEscopo;
    }

    const leadId =
      isPlatformAgenda || isBloqueio || atribuidoPara
        ? null
        : dto.leadId?.trim() || null;

    const alvo = isPlatformAgenda
      ? {
          alvoTipo: AgendamentoAlvo.nenhum,
          alvoEquipeId: null,
          alvoGerenteId: null,
        }
      : isBloqueio && requester.role === Role.gerente
        ? {
            alvoTipo: AgendamentoAlvo.nenhum,
            alvoEquipeId: null,
            alvoGerenteId: null,
          }
        : atribuidoPara
          ? {
              alvoTipo: AgendamentoAlvo.nenhum,
              alvoEquipeId: null,
              alvoGerenteId: null,
            }
          : await this.resolveAlvoOnCreate(dto, requester);

    if (
      alvo.alvoTipo === AgendamentoAlvo.nenhum &&
      escopo === AgendamentoEscopo.com_gerente &&
      !leadId
    ) {
      throw new BadRequestException(
        'Selecione um lead ou cliente para compromissos com o gerente.',
      );
    }

    const lead = leadId
      ? await this.ensureLeadAccessible(leadId, requester)
      : null;

    const startsAt = new Date(dto.startsAt);
    const endsAt = this.parseOptionalDate(dto.endsAt);
    this.assertTimeRange(startsAt, endsAt);

    if (isBloqueio && !endsAt) {
      throw new BadRequestException(
        'Informe o horário de término do bloqueio.',
      );
    }

    const recurrenceFreq = isBloqueio
      ? ((dto.recurrenceFreq as AgendamentoRecurrenceFreq | undefined) ??
        AgendamentoRecurrenceFreq.unica)
      : AgendamentoRecurrenceFreq.unica;
    let recurrenceDays = isBloqueio
      ? Array.from(
          new Set(
            (dto.recurrenceDays ?? []).filter(
              (d) => Number.isInteger(d) && d >= 0 && d <= 6,
            ),
          ),
        ).sort((a, b) => a - b)
      : [];
    const recurrenceUntil = isBloqueio
      ? this.parseOptionalDate(dto.recurrenceUntil)
      : null;

    if (
      isBloqueio &&
      recurrenceFreq !== AgendamentoRecurrenceFreq.unica &&
      !recurrenceUntil
    ) {
      throw new BadRequestException(
        'Informe a data final da recorrência do bloqueio.',
      );
    }

    if (
      isBloqueio &&
      recurrenceFreq === AgendamentoRecurrenceFreq.semanal &&
      recurrenceDays.length === 0
    ) {
      recurrenceDays.push(startsAt.getDay());
    }

    const occurrences = isBloqueio
      ? this.expandRecurrenceOccurrences({
          startsAt,
          endsAt: endsAt!,
          freq: recurrenceFreq,
          days: recurrenceDays,
          until: recurrenceUntil,
        })
      : [{ startsAt, endsAt }];

    if (!isBloqueio) {
      const alsoGerenteIds =
        escopo === AgendamentoEscopo.com_gerente &&
        isCorretorLike(requester.role)
          ? await this.resolveGerenteIds(requester.id)
          : [];
      await this.assertNoOverlapWithBloqueios({
        tenantId,
        startsAt,
        endsAt,
        affectedUserIds: atribuidoPara
          ? [atribuidoPara.id]
          : [requester.id],
        alsoGerenteIds,
        adminBroadcastBlocksAll: alvo.alvoTipo === AgendamentoAlvo.todos,
        alvoEquipeId: alvo.alvoEquipeId,
      });
    }

    const vinculo = isBloqueio
      ? { empreendimentoId: null, muralChaveId: null }
      : await this.resolveChaveVinculo({
          tenantId,
          tipo: dto.tipo as AgendamentoTipo,
          empreendimentoId: dto.empreendimentoId,
          muralChaveId: dto.muralChaveId,
          startsAt,
          endsAt,
        });

    const imovelId = isBloqueio
      ? null
      : await this.resolveImovelId(
          tenantId,
          dto.tipo === 'visita' ? dto.imovelId : null,
        );
    const ocupacao = await this.assertVisitaDisponivel({
      tenantId,
      tipo: isBloqueio ? AgendamentoTipo.bloqueio : (dto.tipo as AgendamentoTipo),
      empreendimentoId: vinculo.empreendimentoId,
      imovelId,
      startsAt,
      endsAt,
      toleranciaAtiva: dto.tipo === 'visita' && dto.toleranciaAtiva === true,
    });

    const needsApproval =
      !isBloqueio &&
      !atribuidoPara &&
      alvo.alvoTipo === AgendamentoAlvo.nenhum &&
      escopo === AgendamentoEscopo.com_gerente &&
      isCorretorLike(requester.role);

    const solicitacaoStatus = needsApproval
      ? AgendamentoSolicitacaoStatus.pendente
      : escopo === AgendamentoEscopo.com_gerente &&
          alvo.alvoTipo === AgendamentoAlvo.nenhum
        ? AgendamentoSolicitacaoStatus.aprovada
        : AgendamentoSolicitacaoStatus.nenhuma;

    const seriesId =
      isBloqueio && occurrences.length > 1 ? randomUUID() : null;

    const commonData = {
      tenantId,
      leadId: lead?.id ?? null,
      autorId: requester.id,
      atribuidoParaId: atribuidoPara?.id ?? null,
      titulo: dto.titulo.trim(),
      tipo: dto.tipo as AgendamentoTipo,
      escopo,
      solicitacaoStatus,
      status: AgendamentoStatus.agendado,
      alvoTipo: alvo.alvoTipo,
      alvoEquipeId: alvo.alvoEquipeId,
      alvoGerenteId: alvo.alvoGerenteId,
      seriesId,
      recurrenceFreq,
      recurrenceDays,
      recurrenceUntil,
      local: dto.local?.trim() || null,
      observacoes: dto.observacoes?.trim() || null,
      funilStage: dto.funilStage?.trim() || null,
      contaAtraso: dto.tipo === 'tarefa' && dto.contaAtraso === true,
      empreendimentoId: vinculo.empreendimentoId,
      imovelId: ocupacao.imovelId,
      toleranciaAtiva: ocupacao.toleranciaAtiva,
      bloqueadoAte: ocupacao.bloqueadoAte,
      muralChaveId: vinculo.muralChaveId,
      ...(solicitacaoStatus === AgendamentoSolicitacaoStatus.aprovada
        ? {
            aprovadoPorId: requester.id,
            aprovadoAt: new Date(),
          }
        : {}),
    };

    let created;
    if (occurrences.length === 1) {
      created = await this.prisma.agendamento.create({
        data: {
          ...commonData,
          startsAt: occurrences[0].startsAt,
          endsAt: occurrences[0].endsAt,
        },
        select: agendamentoSelect,
      });
    } else {
      await this.prisma.agendamento.createMany({
        data: occurrences.map((occ) => ({
          ...commonData,
          id: randomUUID(),
          startsAt: occ.startsAt,
          endsAt: occ.endsAt,
        })),
      });
      created = await this.prisma.agendamento.findFirstOrThrow({
        where: {
          tenantId,
          seriesId: seriesId!,
          startsAt: occurrences[0].startsAt,
        },
        select: agendamentoSelect,
        orderBy: { startsAt: 'asc' },
      });
    }

    if (created.tipo === AgendamentoTipo.visita) {
      await this.registrarHistoricoVisita({
        tenantId,
        agendamentoId: created.id,
        autorId: requester.id,
        acao: AgendamentoHistoricoAcao.criado,
        detalhe: this.detalheVisita({
          titulo: created.titulo,
          startsAt: created.startsAt,
          bloqueadoAte: created.bloqueadoAte,
          toleranciaAtiva: created.toleranciaAtiva,
          corretorNome: created.atribuidoPara?.name ?? created.autor.name,
          empreendimentoNome: created.empreendimento?.nome,
          imovelLabel: this.imovelResumo(created.imovel),
        }),
      });
    }

    if (needsApproval && lead) {
      const destinatarios = await this.resolveGerenteIds(requester.id);
      const when = startsAt.toLocaleString('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
      });
      await Promise.all(
        destinatarios.map((userId) =>
          this.notificacoes.createAgendaSolicitacao({
            userId,
            agendamentoId: created.id,
            leadId: lead.id,
            titulo: created.titulo,
            autorNome: requester.name,
            quando: when,
          }),
        ),
      );
    } else if (
      lead &&
      created.tipo === AgendamentoTipo.visita &&
      STAGES_BEFORE_VISITA.has(lead.stage)
    ) {
      await this.advanceLeadToVisitaAgendada(
        lead.id,
        lead.stage,
        requester.id,
        tenantId,
      );
      await this.monitoramento.concludeOverdueTarefas(
        tenantId,
        lead.id,
        new Date(),
        created.id,
      );
    } else if (lead && created.tipo !== AgendamentoTipo.bloqueio) {
      await this.monitoramento.recordMovement(
        lead.id,
        created.tipo === AgendamentoTipo.tarefa ? 'tarefa' : 'atividade',
      );
      await this.monitoramento.concludeOverdueTarefas(
        tenantId,
        lead.id,
        new Date(),
        created.id,
      );
    }

    if (atribuidoPara) {
      const when = startsAt.toLocaleString('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
      });
      await this.notificacoes.createAgendaAtribuicao({
        userId: atribuidoPara.id,
        agendamentoId: created.id,
        titulo: created.titulo,
        autorNome: requester.name,
        quando: when,
      });
    }

    if (seriesId && occurrences.length > 1) {
      const seriesItems = await this.prisma.agendamento.findMany({
        where: { tenantId, seriesId },
        select: agendamentoSelect,
      });
      for (const item of seriesItems) await this.queueGoogleSync(item);
    } else {
      await this.queueGoogleSync(created);
    }

    return created;
  }

  async update(
    id: string,
    dto: UpdateAgendamentoDto,
    requester: AuthenticatedUser,
  ) {
    if (isAniversarioId(id)) {
      throw new BadRequestException(
        'Aniversários de corretores são somente leitura.',
      );
    }
    const tenantId = requireTenantId(requester);
    const existing = await this.prisma.agendamento.findFirst({
      where: { id, tenantId },
      select: {
        id: true,
        leadId: true,
        autorId: true,
        atribuidoParaId: true,
        tipo: true,
        status: true,
        startsAt: true,
        endsAt: true,
        solicitacaoStatus: true,
        escopo: true,
        alvoTipo: true,
        alvoEquipeId: true,
        alvoGerenteId: true,
        empreendimentoId: true,
        imovelId: true,
        toleranciaAtiva: true,
        bloqueadoAte: true,
        muralChaveId: true,
        titulo: true,
        autor: { select: { role: true, name: true } },
      },
    });
    if (!existing) {
      throw new NotFoundException('Agendamento não encontrado.');
    }

    await this.ensureAgendamentoAccessible(existing, requester);

    const isAssigneeConcluir =
      existing.atribuidoParaId === requester.id &&
      existing.autorId !== requester.id &&
      dto.status === 'concluido' &&
      dto.titulo === undefined &&
      dto.tipo === undefined &&
      dto.startsAt === undefined &&
      dto.endsAt === undefined &&
      dto.local === undefined &&
      dto.observacoes === undefined &&
      dto.alvoTipo === undefined;

    if (!isAssigneeConcluir) {
      this.assertCanModifyAgendamento(existing, requester);
    }

    if (
      existing.atribuidoParaId === requester.id &&
      existing.autorId !== requester.id &&
      !isAssigneeConcluir
    ) {
      throw new ForbiddenException(
        'Você só pode marcar como concluída a tarefa atribuída.',
      );
    }

    if (
      existing.solicitacaoStatus === AgendamentoSolicitacaoStatus.pendente &&
      isCorretorLike(requester.role) &&
      existing.autorId !== requester.id
    ) {
      throw new ForbiddenException(
        'Solicitação pendente — apenas o autor ou o gerente podem alterar.',
      );
    }

    const startsAt =
      dto.startsAt !== undefined ? new Date(dto.startsAt) : existing.startsAt;
    const endsAt =
      dto.endsAt !== undefined
        ? this.parseOptionalDate(dto.endsAt)
        : existing.endsAt;
    this.assertTimeRange(startsAt, endsAt);

    const nextTipo = (dto.tipo as AgendamentoTipo | undefined) ?? existing.tipo;
    if (nextTipo !== AgendamentoTipo.bloqueio) {
      const alsoGerenteIds =
        existing.escopo === AgendamentoEscopo.com_gerente &&
        isCorretorLike(requester.role)
          ? await this.resolveGerenteIds(requester.id)
          : [];
      await this.assertNoOverlapWithBloqueios({
        tenantId,
        startsAt,
        endsAt,
        affectedUserIds: existing.atribuidoParaId
          ? [existing.atribuidoParaId]
          : [existing.autorId],
        alsoGerenteIds,
        adminBroadcastBlocksAll: existing.alvoTipo === AgendamentoAlvo.todos,
        alvoEquipeId: existing.alvoEquipeId,
        excludeId: existing.id,
      });
    }

    const data: Prisma.AgendamentoUpdateInput = {};
    if (dto.titulo !== undefined) data.titulo = dto.titulo.trim();
    if (dto.tipo !== undefined) data.tipo = dto.tipo as AgendamentoTipo;
    if (dto.status !== undefined) {
      data.status = dto.status as AgendamentoStatus;
      // Cancelar um compromisso pendente encerra a solicitação.
      if (
        dto.status === AgendamentoStatus.cancelado &&
        existing.solicitacaoStatus === AgendamentoSolicitacaoStatus.pendente
      ) {
        data.solicitacaoStatus = AgendamentoSolicitacaoStatus.recusada;
        data.motivoRecusa = 'Cancelado pelo autor.';
      }
    }
    if (dto.startsAt !== undefined) data.startsAt = startsAt;
    if (dto.endsAt !== undefined) data.endsAt = endsAt;
    if (dto.local !== undefined) data.local = dto.local?.trim() || null;
    if (dto.observacoes !== undefined) {
      data.observacoes = dto.observacoes?.trim() || null;
    }

    const nextEmpreendimentoId =
      dto.empreendimentoId !== undefined
        ? dto.empreendimentoId
        : existing.empreendimentoId;
    const nextImovelId =
      nextTipo === AgendamentoTipo.visita
        ? dto.imovelId !== undefined
          ? await this.resolveImovelId(tenantId, dto.imovelId)
          : existing.imovelId
        : null;
    const nextTolerancia =
      nextTipo === AgendamentoTipo.visita &&
      (dto.toleranciaAtiva !== undefined
        ? dto.toleranciaAtiva === true
        : existing.toleranciaAtiva);

    if (
      dto.empreendimentoId !== undefined ||
      dto.muralChaveId !== undefined ||
      dto.imovelId !== undefined ||
      dto.toleranciaAtiva !== undefined ||
      dto.tipo !== undefined ||
      dto.startsAt !== undefined ||
      dto.endsAt !== undefined ||
      dto.status !== undefined
    ) {
      const vinculo = await this.resolveChaveVinculo({
        tenantId,
        tipo: nextTipo,
        empreendimentoId: nextEmpreendimentoId,
        muralChaveId:
          dto.muralChaveId !== undefined
            ? dto.muralChaveId
            : existing.muralChaveId,
        startsAt,
        endsAt,
        ignoreId: existing.id,
      });
      const statusBloqueia =
        (dto.status as AgendamentoStatus | undefined) ?? existing.status;
      const ocupacao =
        statusBloqueia === AgendamentoStatus.agendado
          ? await this.assertVisitaDisponivel({
              tenantId,
              tipo: nextTipo,
              empreendimentoId: vinculo.empreendimentoId,
              imovelId: nextImovelId,
              startsAt,
              endsAt,
              toleranciaAtiva: nextTolerancia,
              ignoreId: existing.id,
            })
          : {
              bloqueadoAte:
                statusBloqueia === AgendamentoStatus.cancelado
                  ? null
                  : existing.bloqueadoAte,
              toleranciaAtiva: nextTolerancia,
              imovelId: nextImovelId,
            };
      data.empreendimento = vinculo.empreendimentoId
        ? { connect: { id: vinculo.empreendimentoId } }
        : { disconnect: true };
      data.imovel = ocupacao.imovelId
        ? { connect: { id: ocupacao.imovelId } }
        : { disconnect: true };
      data.toleranciaAtiva = ocupacao.toleranciaAtiva;
      data.bloqueadoAte = ocupacao.bloqueadoAte;
      data.muralChave = vinculo.muralChaveId
        ? { connect: { id: vinculo.muralChaveId } }
        : { disconnect: true };
    }

    if (
      dto.alvoTipo !== undefined ||
      dto.alvoEquipeId !== undefined ||
      dto.alvoGerenteId !== undefined
    ) {
      const alvo = await this.resolveAlvoOnUpdate(dto, existing, requester);
      data.alvoTipo = alvo.alvoTipo;
      data.alvoEquipe = alvo.alvoEquipeId
        ? { connect: { id: alvo.alvoEquipeId } }
        : { disconnect: true };
      data.alvoGerente = alvo.alvoGerenteId
        ? { connect: { id: alvo.alvoGerenteId } }
        : { disconnect: true };
    }

    const updated = await this.prisma.agendamento.update({
      where: { id },
      data,
      select: agendamentoSelect,
    });
    if (
      updated.tipo === AgendamentoTipo.visita ||
      existing.tipo === AgendamentoTipo.visita
    ) {
      const acao =
        updated.status === AgendamentoStatus.cancelado
          ? AgendamentoHistoricoAcao.cancelado
          : updated.status === AgendamentoStatus.concluido
            ? AgendamentoHistoricoAcao.concluido
            : AgendamentoHistoricoAcao.alterado;
      await this.registrarHistoricoVisita({
        tenantId,
        agendamentoId: updated.id,
        autorId: requester.id,
        acao,
        detalhe: this.detalheVisita({
          titulo: updated.titulo,
          startsAt: updated.startsAt,
          bloqueadoAte: updated.bloqueadoAte,
          toleranciaAtiva: updated.toleranciaAtiva,
          corretorNome: updated.atribuidoPara?.name ?? updated.autor.name,
          empreendimentoNome: updated.empreendimento?.nome,
          imovelLabel: this.imovelResumo(updated.imovel),
        }),
      });
    }
    await this.queueGoogleSync(updated);
    return updated;
  }

  async aprovar(id: string, requester: AuthenticatedUser) {
    this.assertSomenteGerente(requester);
    const tenantId = requireTenantId(requester);

    const existing = await this.prisma.agendamento.findFirst({
      where: { id, tenantId },
      select: {
        id: true,
        leadId: true,
        autorId: true,
        titulo: true,
        tipo: true,
        escopo: true,
        solicitacaoStatus: true,
        startsAt: true,
        lead: { select: { stage: true, nome: true } },
      },
    });
    if (!existing) {
      throw new NotFoundException('Agendamento não encontrado.');
    }
    await this.ensureAgendamentoAccessible(existing, requester);

    if (existing.escopo !== AgendamentoEscopo.com_gerente) {
      throw new BadRequestException('Este compromisso não exige aprovação.');
    }
    if (existing.solicitacaoStatus !== AgendamentoSolicitacaoStatus.pendente) {
      throw new BadRequestException('Solicitação não está pendente.');
    }

    const updated = await this.prisma.agendamento.update({
      where: { id },
      data: {
        solicitacaoStatus: AgendamentoSolicitacaoStatus.aprovada,
        aprovadoPorId: requester.id,
        aprovadoAt: new Date(),
        motivoRecusa: null,
      },
      select: agendamentoSelect,
    });

    await this.notificacoes.createAgendaResposta({
      userId: existing.autorId,
      agendamentoId: existing.id,
      leadId: existing.leadId,
      titulo: existing.titulo,
      aprovado: true,
    });

    if (
      existing.leadId &&
      existing.lead &&
      existing.tipo === AgendamentoTipo.visita &&
      STAGES_BEFORE_VISITA.has(existing.lead.stage)
    ) {
      await this.advanceLeadToVisitaAgendada(
        existing.leadId,
        existing.lead.stage,
        requester.id,
        tenantId,
      );
    }

    await this.queueGoogleSync(updated);
    return updated;
  }

  async recusar(
    id: string,
    motivo: string | undefined,
    requester: AuthenticatedUser,
  ) {
    this.assertSomenteGerente(requester);
    const tenantId = requireTenantId(requester);

    const existing = await this.prisma.agendamento.findFirst({
      where: { id, tenantId },
      select: {
        id: true,
        leadId: true,
        autorId: true,
        titulo: true,
        escopo: true,
        solicitacaoStatus: true,
      },
    });
    if (!existing) {
      throw new NotFoundException('Agendamento não encontrado.');
    }
    await this.ensureAgendamentoAccessible(existing, requester);

    if (existing.escopo !== AgendamentoEscopo.com_gerente) {
      throw new BadRequestException('Este compromisso não exige aprovação.');
    }
    if (existing.solicitacaoStatus !== AgendamentoSolicitacaoStatus.pendente) {
      throw new BadRequestException('Solicitação não está pendente.');
    }

    const updated = await this.prisma.agendamento.update({
      where: { id },
      data: {
        solicitacaoStatus: AgendamentoSolicitacaoStatus.recusada,
        status: AgendamentoStatus.cancelado,
        aprovadoPorId: requester.id,
        aprovadoAt: new Date(),
        motivoRecusa: motivo?.trim() || null,
      },
      select: agendamentoSelect,
    });

    if (updated.tipo === AgendamentoTipo.visita) {
      await this.registrarHistoricoVisita({
        tenantId,
        agendamentoId: updated.id,
        autorId: requester.id,
        acao: AgendamentoHistoricoAcao.cancelado,
        detalhe: this.detalheVisita({
          titulo: updated.titulo,
          startsAt: updated.startsAt,
          bloqueadoAte: null,
          toleranciaAtiva: updated.toleranciaAtiva,
          corretorNome: updated.atribuidoPara?.name ?? updated.autor.name,
          empreendimentoNome: updated.empreendimento?.nome,
          imovelLabel: this.imovelResumo(updated.imovel),
        }),
      });
    }

    await this.notificacoes.createAgendaResposta({
      userId: existing.autorId,
      agendamentoId: existing.id,
      leadId: existing.leadId,
      titulo: existing.titulo,
      aprovado: false,
      motivo: motivo?.trim(),
    });

    await this.queueGoogleSync(updated);
    return updated;
  }

  async remove(
    id: string,
    requester: AuthenticatedUser,
    seriesMode: 'one' | 'all' = 'one',
  ) {
    if (isAniversarioId(id)) {
      throw new BadRequestException(
        'Aniversários de corretores são somente leitura.',
      );
    }
    const tenantId = requireTenantId(requester);
    const existing = await this.prisma.agendamento.findFirst({
      where: { id, tenantId },
      select: {
        id: true,
        leadId: true,
        autorId: true,
        atribuidoParaId: true,
        tipo: true,
        escopo: true,
        alvoTipo: true,
        alvoEquipeId: true,
        alvoGerenteId: true,
        seriesId: true,
        autor: { select: { role: true } },
      },
    });
    if (!existing) {
      throw new NotFoundException('Agendamento não encontrado.');
    }

    await this.ensureAgendamentoAccessible(existing, requester);
    this.assertCanModifyAgendamento(existing, requester);

    if (
      isCorretorLike(requester.role) &&
      existing.autorId !== requester.id
    ) {
      throw new ForbiddenException(
        'Você só pode excluir agendamentos que criou.',
      );
    }

    if (existing.tipo === AgendamentoTipo.visita) {
      const completo = await this.prisma.agendamento.findFirst({
        where: { id: existing.id, tenantId },
        select: agendamentoSelect,
      });
      if (completo) {
        await this.registrarHistoricoVisita({
          tenantId,
          agendamentoId: completo.id,
          autorId: requester.id,
          acao: AgendamentoHistoricoAcao.excluido,
          detalhe: this.detalheVisita({
            titulo: completo.titulo,
            startsAt: completo.startsAt,
            bloqueadoAte: completo.bloqueadoAte,
            toleranciaAtiva: completo.toleranciaAtiva,
            corretorNome: completo.atribuidoPara?.name ?? completo.autor.name,
            empreendimentoNome: completo.empreendimento?.nome,
            imovelLabel: this.imovelResumo(completo.imovel),
          }),
        });
      }
    }

    if (
      seriesMode === 'all' &&
      existing.seriesId &&
      (requester.role === Role.admin ||
        requester.role === Role.gerente ||
        existing.autorId === requester.id)
    ) {
      const series = await this.prisma.agendamento.findMany({
        where: { tenantId, seriesId: existing.seriesId },
        select: { id: true },
      });
      await this.googleCalendar
        .removeMany(series.map((item) => item.id))
        .catch((err) =>
          this.logger.warn(
            `Falha ao remover série no Google Calendar: ${err instanceof Error ? err.message : err}`,
          ),
        );
      await this.prisma.agendamento.deleteMany({
        where: { tenantId, seriesId: existing.seriesId },
      });
      return { ok: true, deletedSeries: true };
    }

    await this.googleCalendar.removeAgendamento(id).catch((err) =>
      this.logger.warn(
        `Falha ao remover evento no Google Calendar: ${err instanceof Error ? err.message : err}`,
      ),
    );
    await this.prisma.agendamento.delete({ where: { id } });
    return { ok: true };
  }

  /** Cria ou atualiza o compromisso da tarefa e replica no Google de quem já está conectado. */
  async syncEspelhoTarefa(input: {
    agendaEventoId?: string | null;
    tenantId: string;
    autorId: string;
    titulo: string;
    descricao: string;
    startsAt: Date;
    responsavelId: string;
    leadId: string | null;
    imovelId: string | null;
    concluida: boolean;
  }): Promise<string> {
    const endsAt = new Date(input.startsAt.getTime() + 30 * 60 * 1000);
    const data = {
      titulo: input.titulo,
      observacoes: input.descricao || null,
      startsAt: input.startsAt,
      endsAt,
      atribuidoParaId: input.responsavelId,
      leadId: input.leadId,
      imovelId: input.imovelId,
      status: input.concluida
        ? AgendamentoStatus.concluido
        : AgendamentoStatus.agendado,
      tipo: AgendamentoTipo.tarefa,
      origemTarefa: true,
      escopo: AgendamentoEscopo.pessoal,
      contaAtraso: false,
    };

    let id = input.agendaEventoId ?? null;
    if (id) {
      const existing = await this.prisma.agendamento.findFirst({
        where: { id, tenantId: input.tenantId, origemTarefa: true },
        select: { id: true },
      });
      if (!existing) id = null;
    }

    const select = {
      id: true,
      tenantId: true,
      autorId: true,
      atribuidoParaId: true,
      titulo: true,
      tipo: true,
      status: true,
      solicitacaoStatus: true,
      alvoTipo: true,
      alvoEquipeId: true,
      alvoGerenteId: true,
      startsAt: true,
      endsAt: true,
      local: true,
      observacoes: true,
      lead: { select: { nome: true } },
    } as const;

    const row = id
      ? await this.prisma.agendamento.update({
          where: { id },
          data,
          select,
        })
      : await this.prisma.agendamento.create({
          data: {
            ...data,
            tenantId: input.tenantId,
            autorId: input.autorId,
          },
          select,
        });

    await this.googleCalendar.syncAgendamento(row).catch((err) =>
      this.logger.warn(
        `Falha ao sincronizar tarefa com Google Calendar: ${err instanceof Error ? err.message : err}`,
      ),
    );
    return row.id;
  }

  async removeEspelhoTarefa(agendaEventoId: string | null) {
    if (!agendaEventoId) return;
    await this.googleCalendar.removeAgendamento(agendaEventoId).catch((err) =>
      this.logger.warn(
        `Falha ao remover tarefa no Google Calendar: ${err instanceof Error ? err.message : err}`,
      ),
    );
    await this.prisma.agendamento.deleteMany({
      where: { id: agendaEventoId, origemTarefa: true },
    });
  }

  private async queueGoogleSync(item: AgendamentoListItem) {
    try {
      await this.googleCalendar.syncAgendamento(item);
    } catch (err) {
      this.logger.warn(
        `Falha ao sincronizar com Google Calendar: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  private assertSomenteGerente(requester: AuthenticatedUser) {
    if (requester.role !== Role.gerente) {
      throw new ForbiddenException(
        'Apenas o gerente da equipe pode aprovar ou recusar solicitações.',
      );
    }
  }

  /**
   * Acesso a compromissos compartilhados (com gerente): leads no escopo da equipe.
   * Tarefas pessoais não entram aqui — só o autor as vê.
   */
  private async buildSharedAccessFilter(
    requester: AuthenticatedUser,
    filterCorretorId?: string,
    filterEquipeId?: string,
  ): Promise<Prisma.AgendamentoWhereInput | null> {
    const tenantId = requireTenantId(requester);
    const leadFilter: Prisma.LeadWhereInput = {
      perdidoAt: null,
      ...(await this.teamScope.leadScope(requester)),
    };

    if (filterEquipeId && !isCorretorLike(requester.role)) {
      const equipe = await this.prisma.equipe.findFirst({
        where: { id: filterEquipeId, tenantId },
        select: {
          id: true,
          gerenteId: true,
          membros: { select: { id: true } },
        },
      });
      if (!equipe) return null;
      if (
        requester.role === Role.gerente &&
        equipe.gerenteId !== requester.id
      ) {
        return null;
      }

      const memberIds = [
        equipe.gerenteId,
        ...equipe.membros.map((m) => m.id),
      ];

      if (filterCorretorId) {
        if (!memberIds.includes(filterCorretorId)) return null;
        const allowed = await this.teamScope.canAccessCorretor(
          requester,
          filterCorretorId,
        );
        if (!allowed) return null;
        leadFilter.corretorId = filterCorretorId;
      } else {
        leadFilter.corretorId = { in: memberIds };
      }

      return { lead: leadFilter };
    }

    if (filterCorretorId && !isCorretorLike(requester.role)) {
      const allowed = await this.teamScope.canAccessCorretor(
        requester,
        filterCorretorId,
      );
      if (!allowed) return null;
      leadFilter.corretorId = filterCorretorId;
    }

    return { lead: leadFilter };
  }

  /**
   * Visibilidade de eventos do admin (alvoTipo != nenhum).
   * Admin sempre vê; demais conforme todos / equipe / gerente / gerentes.
   */
  private async buildAdminEventVisibility(
    requester: AuthenticatedUser,
    filterEquipeId?: string,
  ): Promise<Prisma.AgendamentoWhereInput | null> {
    const tenantId = requireTenantId(requester);
    if (requester.role === Role.admin) {
      if (!filterEquipeId) {
        return {
          alvoTipo: {
            in: [
              AgendamentoAlvo.todos,
              AgendamentoAlvo.equipe,
              AgendamentoAlvo.gerente,
              AgendamentoAlvo.gerentes,
            ],
          },
        };
      }

      const equipe = await this.prisma.equipe.findFirst({
        where: { id: filterEquipeId, tenantId },
        select: { id: true, gerenteId: true },
      });
      if (!equipe) return null;

      return {
        OR: [
          { alvoTipo: AgendamentoAlvo.todos },
          { alvoTipo: AgendamentoAlvo.gerentes },
          {
            alvoTipo: AgendamentoAlvo.equipe,
            alvoEquipeId: filterEquipeId,
          },
          {
            alvoTipo: AgendamentoAlvo.gerente,
            alvoGerenteId: equipe.gerenteId,
          },
        ],
      };
    }

    const clauses: Prisma.AgendamentoWhereInput[] = [
      { alvoTipo: AgendamentoAlvo.todos },
    ];

    if (requester.role === Role.gerente) {
      const equipe = await this.prisma.equipe.findFirst({
        where: { gerenteId: requester.id },
        select: { id: true },
      });
      if (equipe) {
        clauses.push({
          alvoTipo: AgendamentoAlvo.equipe,
          alvoEquipeId: equipe.id,
        });
      }
      clauses.push({
        alvoTipo: AgendamentoAlvo.gerente,
        alvoGerenteId: requester.id,
      });
      clauses.push({ alvoTipo: AgendamentoAlvo.gerentes });
    } else if (isCorretorLike(requester.role)) {
      const user = await this.prisma.user.findUnique({
        where: { id: requester.id },
        select: { equipeId: true },
      });
      if (user?.equipeId) {
        clauses.push({
          alvoTipo: AgendamentoAlvo.equipe,
          alvoEquipeId: user.equipeId,
        });
      }
    }

    return { OR: clauses };
  }

  private async resolveAlvoOnCreate(
    dto: CreateAgendamentoDto,
    requester: AuthenticatedUser,
  ): Promise<{
    alvoTipo: AgendamentoAlvo;
    alvoEquipeId: string | null;
    alvoGerenteId: string | null;
  }> {
    if (requester.role !== Role.admin) {
      return {
        alvoTipo: AgendamentoAlvo.nenhum,
        alvoEquipeId: null,
        alvoGerenteId: null,
      };
    }

    const tipo = (dto.alvoTipo as AgendamentoAlvo | undefined) ?? AgendamentoAlvo.todos;
    if (tipo === AgendamentoAlvo.nenhum) {
      return {
        alvoTipo: AgendamentoAlvo.nenhum,
        alvoEquipeId: null,
        alvoGerenteId: null,
      };
    }

    return this.assertAndNormalizeAlvo(
      requireTenantId(requester),
      tipo,
      dto.alvoEquipeId,
      dto.alvoGerenteId,
    );
  }

  private async resolveAlvoOnUpdate(
    dto: UpdateAgendamentoDto,
    existing: {
      alvoTipo: AgendamentoAlvo;
      alvoEquipeId: string | null;
      alvoGerenteId: string | null;
    },
    requester: AuthenticatedUser,
  ): Promise<{
    alvoTipo: AgendamentoAlvo;
    alvoEquipeId: string | null;
    alvoGerenteId: string | null;
  }> {
    if (requester.role !== Role.admin) {
      throw new ForbiddenException(
        'Apenas administradores podem alterar o público do evento.',
      );
    }

    const tipo =
      (dto.alvoTipo as AgendamentoAlvo | undefined) ?? existing.alvoTipo;
    if (tipo === AgendamentoAlvo.nenhum) {
      return {
        alvoTipo: AgendamentoAlvo.nenhum,
        alvoEquipeId: null,
        alvoGerenteId: null,
      };
    }

    const equipeId =
      dto.alvoEquipeId !== undefined
        ? dto.alvoEquipeId?.trim() || null
        : existing.alvoEquipeId;
    const gerenteId =
      dto.alvoGerenteId !== undefined
        ? dto.alvoGerenteId?.trim() || null
        : existing.alvoGerenteId;

    return this.assertAndNormalizeAlvo(
      requireTenantId(requester),
      tipo,
      equipeId,
      gerenteId,
    );
  }

  private async assertAndNormalizeAlvo(
    tenantId: string,
    tipo: AgendamentoAlvo,
    alvoEquipeId?: string | null,
    alvoGerenteId?: string | null,
  ): Promise<{
    alvoTipo: AgendamentoAlvo;
    alvoEquipeId: string | null;
    alvoGerenteId: string | null;
  }> {
    if (tipo === AgendamentoAlvo.todos) {
      return {
        alvoTipo: AgendamentoAlvo.todos,
        alvoEquipeId: null,
        alvoGerenteId: null,
      };
    }

    if (tipo === AgendamentoAlvo.gerentes) {
      return {
        alvoTipo: AgendamentoAlvo.gerentes,
        alvoEquipeId: null,
        alvoGerenteId: null,
      };
    }

    if (tipo === AgendamentoAlvo.equipe) {
      const id = alvoEquipeId?.trim();
      if (!id) {
        throw new BadRequestException('Selecione a equipe do evento.');
      }
      const equipe = await this.prisma.equipe.findFirst({
        where: { id, tenantId },
        select: { id: true },
      });
      if (!equipe) {
        throw new BadRequestException('Equipe não encontrada.');
      }
      return {
        alvoTipo: AgendamentoAlvo.equipe,
        alvoEquipeId: equipe.id,
        alvoGerenteId: null,
      };
    }

    if (tipo === AgendamentoAlvo.gerente) {
      const id = alvoGerenteId?.trim();
      if (!id) {
        throw new BadRequestException('Selecione o gerente do evento.');
      }
      const gerente = await this.prisma.user.findFirst({
        where: { id, tenantId, role: Role.gerente, status: UserStatus.ativo },
        select: { id: true },
      });
      if (!gerente) {
        throw new BadRequestException('Gerente não encontrado.');
      }
      return {
        alvoTipo: AgendamentoAlvo.gerente,
        alvoEquipeId: null,
        alvoGerenteId: gerente.id,
      };
    }

    throw new BadRequestException('Público do evento inválido.');
  }

  private async ensureAgendamentoAccessible(
    item: {
      leadId: string | null;
      autorId: string;
      atribuidoParaId?: string | null;
      escopo?: AgendamentoEscopo;
      tipo?: AgendamentoTipo;
      alvoTipo?: AgendamentoAlvo;
      alvoEquipeId?: string | null;
      alvoGerenteId?: string | null;
      autor?: { role: Role } | null;
    },
    requester: AuthenticatedUser,
  ) {
    const tenantId = requireTenantId(requester);
    const alvoTipo = item.alvoTipo ?? AgendamentoAlvo.nenhum;

    if (alvoTipo !== AgendamentoAlvo.nenhum) {
      if (requester.role === Role.admin) return;
      if (alvoTipo === AgendamentoAlvo.todos) return;
      if (
        alvoTipo === AgendamentoAlvo.gerentes &&
        requester.role === Role.gerente
      ) {
        return;
      }
      if (
        alvoTipo === AgendamentoAlvo.gerente &&
        item.alvoGerenteId === requester.id
      ) {
        return;
      }
      if (alvoTipo === AgendamentoAlvo.equipe && item.alvoEquipeId) {
        if (requester.role === Role.gerente) {
          const equipe = await this.prisma.equipe.findFirst({
            where: { id: item.alvoEquipeId, gerenteId: requester.id, tenantId },
            select: { id: true },
          });
          if (equipe) return;
        }
        if (isCorretorLike(requester.role)) {
          const user = await this.prisma.user.findUnique({
            where: { id: requester.id },
            select: { equipeId: true },
          });
          if (user?.equipeId === item.alvoEquipeId) return;
        }
      }
      throw new NotFoundException('Agendamento não encontrado.');
    }

    if (item.atribuidoParaId === requester.id) {
      return;
    }

    const autorRole =
      item.autor?.role ??
      (
        await this.prisma.user.findUnique({
          where: { id: item.autorId },
          select: { role: true },
        })
      )?.role;

    // Bloqueio do gerente: visível para a equipe.
    if (
      item.tipo === AgendamentoTipo.bloqueio &&
      autorRole === Role.gerente &&
      isCorretorLike(requester.role)
    ) {
      const equipes = await this.prisma.equipe.findMany({
        where: { gerenteId: item.autorId, tenantId },
        select: {
          membros: {
            where: { id: requester.id },
            select: { id: true },
          },
        },
      });
      if (equipes.some((e) => e.membros.length > 0)) return;
    }

    // Compromissos legados criados por admin sem alvo: visíveis para todos.
    if (autorRole === Role.admin) {
      return;
    }

    // Tarefa pessoal: somente o autor (admin também, para suporte).
    if (item.escopo === AgendamentoEscopo.pessoal) {
      if (
        item.autorId === requester.id ||
        requester.role === Role.admin ||
        (requester.role === Role.gerente &&
          item.atribuidoParaId &&
          (await this.teamScope.canAccessCorretor(
            requester,
            item.atribuidoParaId,
          )))
      ) {
        return;
      }
      throw new NotFoundException('Agendamento não encontrado.');
    }

    if (item.leadId) {
      await this.ensureLeadAccessible(item.leadId, requester);
      return;
    }

    if (requester.role === Role.admin || item.autorId === requester.id) {
      return;
    }

    throw new NotFoundException('Agendamento não encontrado.');
  }

  /**
   * Aniversários virtuais da equipe (admin, gerente, analista, corretor)
   * na agenda do admin. Projetados no intervalo from/to — não são persistidos.
   */
  private async buildUsuarioAniversarios(opts: {
    tenantId: string;
    requester: AuthenticatedUser;
    from: Date | null;
    to: Date | null;
    tipo?: AgendamentoTipo;
    status?: AgendamentoStatus;
    equipeId?: string;
    corretorId?: string;
  }): Promise<AgendamentoListItem[]> {
    const { requester, from, to } = opts;
    if (requester.role !== Role.admin) return [];
    if (!from || !to) return [];
    if (opts.tipo && opts.tipo !== AgendamentoTipo.outro) return [];
    if (opts.status && opts.status !== AgendamentoStatus.agendado) return [];
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return [];
    if (from.getTime() > to.getTime()) return [];

    const roleLabel: Record<Role, string> = {
      [Role.admin]: 'Administrador',
      [Role.gerente]: 'Gerente',
      [Role.analista]: 'Analista',
      [Role.treinee]: 'Treinee',
      [Role.corretor]: 'Corretor',
      [Role.financeiro]: 'Financeiro',
      [Role.assistente]: 'Assistente',
      [Role.super_admin]: 'Plataforma',
    };

    // Filtro por corretor específico: só esse usuário.
    // Filtro por equipe: membros da equipe + gerente da equipe.
    const equipeOr = opts.equipeId
      ? {
          OR: [
            { equipeId: opts.equipeId },
            { equipeGerenciada: { id: opts.equipeId } },
          ],
        }
      : {};

    const usuarios = await this.prisma.user.findMany({
      where: {
        tenantId: opts.tenantId,
        role: {
          in: [Role.admin, Role.gerente, Role.analista, Role.corretor, Role.treinee],
        },
        status: UserStatus.ativo,
        dataNascimento: { not: null },
        ...(opts.corretorId ? { id: opts.corretorId } : {}),
        ...equipeOr,
      },
      select: {
        id: true,
        name: true,
        role: true,
        dataNascimento: true,
        equipeId: true,
        equipe: { select: { id: true, name: true } },
        equipeGerenciada: { select: { id: true, name: true } },
      },
    });
    if (usuarios.length === 0) return [];

    const years = new Set<number>();
    // Usa partes UTC: dataNascimento é salva ao meio-dia UTC.
    const fromY = from.getUTCFullYear();
    const toY = to.getUTCFullYear();
    for (let y = fromY; y <= toY; y += 1) years.add(y);
    // Janela que cruza virada do ano com from/to em UTC.
    years.add(fromY - 1);
    years.add(toY + 1);

    const now = new Date();
    const items: AgendamentoListItem[] = [];
    for (const usuario of usuarios) {
      const nasc = usuario.dataNascimento;
      if (!nasc) continue;
      const month = nasc.getUTCMonth();
      const day = nasc.getUTCDate();
      const perfil = roleLabel[usuario.role] ?? 'Usuário';
      const equipe =
        usuario.equipe ?? usuario.equipeGerenciada ?? null;
      for (const year of years) {
        // 09:00 BRT = 12:00 UTC — cai na grade diária da agenda.
        const startsAt = new Date(Date.UTC(year, month, day, 12, 0, 0));
        if (startsAt < from || startsAt > to) continue;
        const dayKey = startsAt.toISOString().slice(0, 10);
        items.push({
          id: `${ANIVERSARIO_ID_PREFIX}${usuario.id}:${dayKey}`,
          tenantId: opts.tenantId,
          leadId: null,
          autorId: usuario.id,
          atribuidoParaId: null,
          titulo: `Aniversário — ${usuario.name}`,
          tipo: AgendamentoTipo.outro,
          status: AgendamentoStatus.agendado,
          escopo: AgendamentoEscopo.pessoal,
          solicitacaoStatus: AgendamentoSolicitacaoStatus.nenhuma,
          alvoTipo: AgendamentoAlvo.todos,
          alvoEquipeId: equipe?.id ?? usuario.equipeId,
          alvoGerenteId: null,
          seriesId: null,
          recurrenceFreq: AgendamentoRecurrenceFreq.unica,
          recurrenceDays: [],
          recurrenceUntil: null,
          startsAt,
          endsAt: null,
          local: null,
          observacoes: `Aniversário · ${perfil} (somente leitura).`,
          funilStage: null,
          contaAtraso: false,
          empreendimentoId: null,
          imovelId: null,
          toleranciaAtiva: false,
          bloqueadoAte: null,
          muralChaveId: null,
          chaveRetiradaEm: null,
          motivoRecusa: null,
          origemTarefa: false,
          aprovadoAt: null,
          createdAt: now,
          updatedAt: now,
          autor: {
            id: usuario.id,
            name: usuario.name,
            role: usuario.role,
          },
          atribuidoPara: null,
          aprovadoPor: null,
          alvoEquipe: equipe
            ? { id: equipe.id, name: equipe.name }
            : null,
          alvoGerente: null,
          lead: null,
          empreendimento: null,
          imovel: null,
          muralChave: null,
          isAniversario: true,
        });
      }
    }
    return items;
  }

  /** Compromissos do admin só podem ser alterados por admin. */
  private assertCanModifyAgendamento(
    item: {
      autorId: string;
      autor?: { role: Role } | null;
    },
    requester: AuthenticatedUser,
  ) {
    if (item.autor?.role === Role.admin && requester.role !== Role.admin) {
      throw new ForbiddenException(
        'Apenas administradores podem alterar compromissos da equipe.',
      );
    }
  }

  private async resolveGerenteIds(corretorId: string): Promise<string[]> {
    const corretor = await this.prisma.user.findUnique({
      where: { id: corretorId },
      select: { equipe: { select: { gerenteId: true } } },
    });
    // Sem gerente na equipe: não notifica admin — a fila é só do gerente.
    if (corretor?.equipe?.gerenteId) {
      return [corretor.equipe.gerenteId];
    }
    return [];
  }

  /** Mapa corretorId → gerente e nome da equipe. */
  private async resolveEquipeInfoByCorretorIds(
    corretorIds: string[],
  ): Promise<Map<string, { gerenteNome: string; equipeNome: string }>> {
    const map = new Map<
      string,
      { gerenteNome: string; equipeNome: string }
    >();
    if (corretorIds.length === 0) return map;

    const corretores = await this.prisma.user.findMany({
      where: { id: { in: corretorIds } },
      select: {
        id: true,
        equipe: {
          select: {
            name: true,
            gerente: { select: { id: true, name: true } },
          },
        },
      },
    });

    for (const c of corretores) {
      if (c.equipe?.name && c.equipe.gerente?.name) {
        map.set(c.id, {
          equipeNome: c.equipe.name,
          gerenteNome: c.equipe.gerente.name,
        });
      } else if (c.equipe?.name) {
        map.set(c.id, {
          equipeNome: c.equipe.name,
          gerenteNome: '',
        });
      }
    }
    return map;
  }

  private async resolveEquipeByGerenteIds(
    gerenteIds: string[],
  ): Promise<Map<string, { name: string }>> {
    const map = new Map<string, { name: string }>();
    if (gerenteIds.length === 0) return map;

    const equipes = await this.prisma.equipe.findMany({
      where: { gerenteId: { in: gerenteIds } },
      select: { name: true, gerenteId: true },
    });
    for (const e of equipes) {
      map.set(e.gerenteId, { name: e.name });
    }
    return map;
  }

  private parseOptionalDate(value?: string | null): Date | null {
    if (value === undefined || value === null || value === '') return null;
    return new Date(value);
  }

  private async resolveAgendaViewTarget(
    userId: string,
    requester: AuthenticatedUser,
  ): Promise<{
    id: string;
    role: Role;
    equipeId: string | null;
  } | null> {
    if (requester.role !== Role.admin && requester.role !== Role.gerente) {
      return null;
    }

    const tenantId = requireTenantId(requester);
    const target = await this.prisma.user.findFirst({
      where: {
        id: userId,
        tenantId,
        status: UserStatus.ativo,
        role: {
          in:
            requester.role === Role.admin
              ? [Role.corretor, Role.treinee, Role.gerente]
              : [Role.corretor, Role.treinee],
        },
      },
      select: { id: true, role: true, equipeId: true },
    });
    if (!target) {
      throw new ForbiddenException(
        'Você não pode visualizar a agenda deste usuário.',
      );
    }

    if (isCorretorLike(target.role)) {
      const allowed = await this.teamScope.canAccessCorretor(
        requester,
        target.id,
      );
      if (!allowed) {
        throw new ForbiddenException(
          'Você não pode visualizar a agenda deste corretor.',
        );
      }
    }

    return target;
  }

  private async buildAdminEventVisibilityForUser(user: {
    id: string;
    role: Role;
    equipeId: string | null;
  }): Promise<Prisma.AgendamentoWhereInput | null> {
    const clauses: Prisma.AgendamentoWhereInput[] = [
      { alvoTipo: AgendamentoAlvo.todos },
    ];

    if (user.role === Role.gerente) {
      const equipe = await this.prisma.equipe.findFirst({
        where: { gerenteId: user.id },
        select: { id: true },
      });
      if (equipe) {
        clauses.push({
          alvoTipo: AgendamentoAlvo.equipe,
          alvoEquipeId: equipe.id,
        });
      }
      clauses.push({
        alvoTipo: AgendamentoAlvo.gerente,
        alvoGerenteId: user.id,
      });
      clauses.push({ alvoTipo: AgendamentoAlvo.gerentes });
    } else if (isCorretorLike(user.role) && user.equipeId) {
      clauses.push({
        alvoTipo: AgendamentoAlvo.equipe,
        alvoEquipeId: user.equipeId,
      });
    }

    return { OR: clauses };
  }

  private async buildGerenteBloqueioVisibilityForCorretor(
    corretorId: string,
  ): Promise<Prisma.AgendamentoWhereInput | null> {
    const gerenteIds = await this.resolveGerenteIds(corretorId);
    if (gerenteIds.length === 0) return null;
    return {
      tipo: AgendamentoTipo.bloqueio,
      alvoTipo: AgendamentoAlvo.nenhum,
      status: { not: AgendamentoStatus.cancelado },
      autorId: { in: gerenteIds },
    };
  }

  private async buildGerenteBloqueioVisibility(
    requester: AuthenticatedUser,
    filterCorretorId?: string,
  ): Promise<Prisma.AgendamentoWhereInput | null> {
    const tenantId = requireTenantId(requester);

    if (isCorretorLike(requester.role)) {
      const gerenteIds = await this.resolveGerenteIds(requester.id);
      if (gerenteIds.length === 0) return null;
      return {
        tipo: AgendamentoTipo.bloqueio,
        alvoTipo: AgendamentoAlvo.nenhum,
        status: { not: AgendamentoStatus.cancelado },
        autorId: { in: gerenteIds },
      };
    }

    if (requester.role === Role.gerente) {
      // Próprios bloqueios já entram via autorId; inclui bloqueios ao filtrar corretor da equipe.
      if (!filterCorretorId) return null;
      const allowed = await this.teamScope.canAccessCorretor(
        requester,
        filterCorretorId,
      );
      if (!allowed) return null;
      return {
        tipo: AgendamentoTipo.bloqueio,
        alvoTipo: AgendamentoAlvo.nenhum,
        status: { not: AgendamentoStatus.cancelado },
        autorId: requester.id,
      };
    }

    if (requester.role === Role.admin && filterCorretorId) {
      const gerenteIds = await this.resolveGerenteIds(filterCorretorId);
      if (gerenteIds.length === 0) return null;
      return {
        tipo: AgendamentoTipo.bloqueio,
        alvoTipo: AgendamentoAlvo.nenhum,
        status: { not: AgendamentoStatus.cancelado },
        autorId: { in: gerenteIds },
        tenantId,
      };
    }

    return null;
  }

  private async resolveAtribuidoPara(
    userId: string,
    requester: AuthenticatedUser,
  ) {
    if (requester.role !== Role.admin && requester.role !== Role.gerente) {
      throw new ForbiddenException(
        'Apenas admin e gerente podem atribuir tarefas na agenda.',
      );
    }

    const tenantId = requireTenantId(requester);
    const allowedRoles =
      requester.role === Role.admin
        ? [Role.admin, Role.gerente, Role.corretor, Role.treinee, Role.analista]
        : [Role.corretor, Role.treinee];

    const target = await this.prisma.user.findFirst({
      where: {
        id: userId,
        tenantId,
        role: { in: allowedRoles },
        status: UserStatus.ativo,
      },
      select: { id: true, name: true, role: true },
    });
    if (!target) {
      throw new BadRequestException(
        requester.role === Role.admin
          ? 'Usuário não encontrado.'
          : 'Corretor não encontrado.',
      );
    }

    if (requester.role === Role.gerente) {
      const allowed = await this.teamScope.canAccessCorretor(
        requester,
        target.id,
      );
      if (!allowed) {
        throw new ForbiddenException(
          'Você não pode atribuir tarefas a este corretor.',
        );
      }
    }

    return target;
  }

  private expandRecurrenceOccurrences(opts: {
    startsAt: Date;
    endsAt: Date;
    freq: AgendamentoRecurrenceFreq;
    days: number[];
    until: Date | null;
  }): Array<{ startsAt: Date; endsAt: Date }> {
    const durationMs = Math.max(
      0,
      opts.endsAt.getTime() - opts.startsAt.getTime(),
    );

    if (opts.freq === AgendamentoRecurrenceFreq.unica) {
      return [{ startsAt: opts.startsAt, endsAt: opts.endsAt }];
    }

    if (!opts.until) {
      throw new BadRequestException(
        'Informe a data final da recorrência do bloqueio.',
      );
    }

    const untilEnd = new Date(opts.until);
    untilEnd.setHours(23, 59, 59, 999);

    if (untilEnd.getTime() < opts.startsAt.getTime()) {
      throw new BadRequestException(
        'A data final da recorrência deve ser posterior ao início.',
      );
    }

    const out: Array<{ startsAt: Date; endsAt: Date }> = [];

    if (opts.freq === AgendamentoRecurrenceFreq.semanal) {
      const days =
        opts.days.length > 0 ? opts.days : [opts.startsAt.getDay()];
      const cursor = new Date(opts.startsAt);
      while (
        out.length < MAX_RECURRENCE_OCCURRENCES &&
        cursor.getTime() <= untilEnd.getTime()
      ) {
        if (days.includes(cursor.getDay())) {
          const startsAt = new Date(cursor);
          out.push({
            startsAt,
            endsAt: new Date(startsAt.getTime() + durationMs),
          });
        }
        cursor.setDate(cursor.getDate() + 1);
      }
    } else if (opts.freq === AgendamentoRecurrenceFreq.mensal) {
      const cursor = new Date(opts.startsAt);
      while (
        out.length < MAX_RECURRENCE_OCCURRENCES &&
        cursor.getTime() <= untilEnd.getTime()
      ) {
        const startsAt = new Date(cursor);
        out.push({
          startsAt,
          endsAt: new Date(startsAt.getTime() + durationMs),
        });
        cursor.setMonth(cursor.getMonth() + 1);
      }
    }

    if (out.length === 0) {
      throw new BadRequestException(
        'Nenhuma ocorrência gerada para a recorrência informada.',
      );
    }

    return out;
  }

  private async assertNoOverlapWithBloqueios(opts: {
    tenantId: string;
    startsAt: Date;
    endsAt: Date | null;
    affectedUserIds: string[];
    alsoGerenteIds: string[];
    adminBroadcastBlocksAll?: boolean;
    alvoEquipeId?: string | null;
    excludeId?: string;
  }) {
    const end = opts.endsAt ?? opts.startsAt;
    const candidatos = await this.prisma.agendamento.findMany({
      where: {
        tenantId: opts.tenantId,
        tipo: AgendamentoTipo.bloqueio,
        status: { not: AgendamentoStatus.cancelado },
        ...(opts.excludeId ? { id: { not: opts.excludeId } } : {}),
        startsAt: { lt: end },
      },
      select: {
        id: true,
        titulo: true,
        startsAt: true,
        endsAt: true,
        autorId: true,
        alvoTipo: true,
        alvoEquipeId: true,
        alvoGerenteId: true,
        autor: { select: { role: true } },
      },
      take: 500,
    });

    for (const b of candidatos) {
      const bEnd = b.endsAt ?? b.startsAt;
      if (bEnd.getTime() <= opts.startsAt.getTime()) continue;
      if (
        !this.rangesOverlap(opts.startsAt, end, b.startsAt, bEnd)
      ) {
        continue;
      }

      if (opts.adminBroadcastBlocksAll) {
        throw new BadRequestException(
          `Horário bloqueado ("${b.titulo}"). Escolha outro horário.`,
        );
      }

      const applies = await this.bloqueioAppliesToUsers(b, {
        userIds: opts.affectedUserIds,
        gerenteIdsExtra: opts.alsoGerenteIds,
        alvoEquipeId: opts.alvoEquipeId,
      });
      if (applies) {
        throw new BadRequestException(
          `Horário bloqueado ("${b.titulo}"). Escolha outro horário.`,
        );
      }
    }
  }

  private rangesOverlap(
    aStart: Date,
    aEnd: Date,
    bStart: Date,
    bEnd: Date,
  ) {
    return (
      aStart.getTime() < bEnd.getTime() && aEnd.getTime() > bStart.getTime()
    );
  }

  private async bloqueioAppliesToUsers(
    bloqueio: {
      autorId: string;
      alvoTipo: AgendamentoAlvo;
      alvoEquipeId: string | null;
      alvoGerenteId: string | null;
      autor: { role: Role };
    },
    opts: {
      userIds: string[];
      gerenteIdsExtra: string[];
      alvoEquipeId?: string | null;
    },
  ): Promise<boolean> {
    const users = new Set(
      [...opts.userIds, ...opts.gerenteIdsExtra].filter(Boolean),
    );
    if (users.size === 0) return false;

    if (bloqueio.alvoTipo === AgendamentoAlvo.todos) {
      return true;
    }

    if (bloqueio.alvoTipo === AgendamentoAlvo.gerente) {
      return (
        bloqueio.alvoGerenteId != null && users.has(bloqueio.alvoGerenteId)
      );
    }

    if (bloqueio.alvoTipo === AgendamentoAlvo.gerentes) {
      if (opts.gerenteIdsExtra.some((id) => users.has(id))) return true;
      const count = await this.prisma.user.count({
        where: {
          id: { in: [...users] },
          role: Role.gerente,
        },
      });
      return count > 0;
    }

    if (
      bloqueio.alvoTipo === AgendamentoAlvo.equipe &&
      bloqueio.alvoEquipeId
    ) {
      if (
        opts.alvoEquipeId &&
        opts.alvoEquipeId === bloqueio.alvoEquipeId
      ) {
        return true;
      }
      const equipe = await this.prisma.equipe.findFirst({
        where: { id: bloqueio.alvoEquipeId },
        select: {
          gerenteId: true,
          membros: { select: { id: true } },
        },
      });
      if (!equipe) return false;
      const memberIds = new Set([
        equipe.gerenteId,
        ...equipe.membros.map((m) => m.id),
      ]);
      return [...users].some((id) => memberIds.has(id));
    }

    // Bloqueio pessoal do gerente (visível/aplicável à equipe).
    if (
      bloqueio.alvoTipo === AgendamentoAlvo.nenhum &&
      bloqueio.autor.role === Role.gerente
    ) {
      if (users.has(bloqueio.autorId)) return true;
      const equipes = await this.prisma.equipe.findMany({
        where: { gerenteId: bloqueio.autorId },
        select: {
          membros: { select: { id: true } },
        },
      });
      const memberIds = new Set(
        equipes.flatMap((e) => e.membros.map((m) => m.id)),
      );
      return [...users].some((id) => memberIds.has(id));
    }

    return false;
  }

  private assertTimeRange(startsAt: Date, endsAt: Date | null) {
    if (Number.isNaN(startsAt.getTime())) {
      throw new BadRequestException('Data/hora de início inválida.');
    }
    if (endsAt && Number.isNaN(endsAt.getTime())) {
      throw new BadRequestException('Data/hora de término inválida.');
    }
    if (endsAt && endsAt.getTime() < startsAt.getTime()) {
      throw new BadRequestException(
        'O término deve ser igual ou posterior ao início.',
      );
    }
  }

  private async advanceLeadToVisitaAgendada(
    leadId: string,
    stageAnterior: string,
    autorId: string,
    tenantId: string,
  ) {
    const stageNovo = 'visita-agendada';
    const now = new Date();
    const timing = await this.monitoramento.stageChangeData(
      tenantId,
      stageNovo,
      now,
    );
    await this.prisma.lead.update({
      where: { id: leadId },
      data: {
        stage: stageNovo,
        ...timing,
        lastAtividadeAt: now,
        lastTriagemAt: now,
      },
    });

    const [fromLabel, toLabel] = await Promise.all([
      this.resolveStageLabel(tenantId, stageAnterior),
      this.resolveStageLabel(tenantId, stageNovo),
    ]);

    await this.prisma.triagemEvent.create({
      data: {
        leadId,
        autorId,
        texto: `Etapa avançada de "${fromLabel}" para "${toLabel}" (visita agendada).`,
        stageAnterior,
        stageNovo,
        origem: TriagemOrigem.funil,
      },
    });
  }

  private async resolveStageLabel(
    tenantId: string,
    slug: string,
  ): Promise<string> {
    const item = await this.prisma.catalogItem.findFirst({
      where: { tenantId, type: CatalogType.funil_etapa, slug },
      select: { label: true },
    });
    return item?.label ?? slug;
  }

  private async ensureLeadAccessible(
    leadId: string,
    requester: AuthenticatedUser,
  ) {
    const tenantId = requireTenantId(requester);
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, tenantId },
      select: {
        id: true,
        tipo: true,
        nome: true,
        stage: true,
        corretorId: true,
        perdidoAt: true,
      },
    });

    if (!lead || lead.perdidoAt) {
      throw new NotFoundException('Lead/cliente não encontrado.');
    }

    const allowed = await this.teamScope.canAccessCorretor(
      requester,
      lead.corretorId,
    );
    if (!allowed) {
      throw new NotFoundException('Lead/cliente não encontrado.');
    }

    return lead;
  }
}

/** Meia-noite em America/Sao_Paulo (UTC-3 o ano inteiro). */
function saoPauloDayBounds(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const year = Number(parts.find((p) => p.type === 'year')?.value);
  const month = Number(parts.find((p) => p.type === 'month')?.value);
  const day = Number(parts.find((p) => p.type === 'day')?.value);
  const start = new Date(Date.UTC(year, month - 1, day, 3, 0, 0, 0));
  const end = new Date(start.getTime() + 86_400_000);
  return { start, end };
}
