import { randomUUID } from 'crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Prisma,
  Role,
  TarefaLembrete,
  TarefaRecorrencia,
  TarefaStatus,
} from '@prisma/client';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { requireTenantId } from '../common/utils/tenant';
import { resolveNotifyEmail } from '../mailer/mailer.service';
import { MailerService } from '../mailer/mailer.service';
import { AgendaService } from '../agenda/agenda.service';
import { isCorretorLike } from '../common/utils/roles';
import { TeamScopeService } from '../equipes/team-scope.service';
import { PrismaService } from '../prisma/prisma.service';
import { tenantTemTarefas } from '../tenants/tenant-plan';
import { CreateComentarioDto } from './dto/create-comentario.dto';
import { CreateTarefaDto } from './dto/create-tarefa.dto';
import { UpdateTarefaDto } from './dto/update-tarefa.dto';
import {
  lembreteEmFrom,
  nextData,
  todayYmd,
  venceEmFrom,
} from './tarefa-schedule';

const tarefaInclude = {
  responsavel: { select: { id: true, name: true, email: true, notifyEmail: true } },
  criadoPor: { select: { id: true, name: true } },
  lead: { select: { id: true, nome: true } },
  agendamento: { select: { id: true, titulo: true } },
  imovel: {
    select: {
      id: true,
      logradouro: true,
      numero: true,
      bairro: true,
      cidade: true,
    },
  },
  comentarios: {
    orderBy: { createdAt: 'asc' as const },
    include: { autor: { select: { id: true, name: true } } },
  },
} satisfies Prisma.TarefaInclude;

const VER_TODOS = new Set<Role>([Role.admin, Role.super_admin]);

@Injectable()
export class TarefasService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TarefasService.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
    private readonly agenda: AgendaService,
    private readonly teamScope: TeamScopeService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      void this.dispatchEmails().catch((err) => {
        const detail = err instanceof Error ? err.message : 'erro';
        this.logger.warn(`Fila de tarefas: ${detail}`);
      });
    }, 60_000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async acesso(requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { plano: true, tarefasEnabled: true },
    });
    return { enabled: Boolean(tenant && tenantTemTarefas(tenant)) };
  }

  async list(
    requester: AuthenticatedUser,
    query: {
      filtro?: string;
      leadId?: string;
      agendamentoId?: string;
      imovelId?: string;
    },
  ) {
    const tenantId = await this.assertEnabled(requester);
    const where = await this.scopeWhere(requester, tenantId);
    if (query.leadId) where.leadId = query.leadId;
    if (query.agendamentoId) where.agendamentoId = query.agendamentoId;
    if (query.imovelId) where.imovelId = query.imovelId;

    const now = new Date();
    const hoje = todayYmd(now);
    const filtro = query.filtro ?? 'todas';
    if (filtro === 'concluidas') where.status = TarefaStatus.concluida;
    else if (filtro !== 'todas') where.status = TarefaStatus.aberta;
    if (filtro === 'hoje') where.data = hoje;
    if (filtro === 'proximas') where.data = { gt: hoje };
    if (filtro === 'atrasadas') where.venceEm = { lt: now };

    const items = await this.prisma.tarefa.findMany({
      where,
      include: tarefaInclude,
      orderBy: [{ venceEm: 'asc' }],
      take: 300,
    });
    return items.map((item) => this.present(item, now));
  }

  async create(dto: CreateTarefaDto, requester: AuthenticatedUser) {
    const tenantId = await this.assertEnabled(requester);
    const data = await this.buildData(dto, tenantId, requester);
    const created = await this.prisma.tarefa.create({
      data: {
        ...data,
        criadoPorId: requester.id,
        serieId: data.recorrencia === 'nenhuma' ? null : randomUUID(),
      },
      include: tarefaInclude,
    });
    return this.present(await this.attachEspelho(created), new Date());
  }

  async update(id: string, dto: UpdateTarefaDto, requester: AuthenticatedUser) {
    const tenantId = await this.assertEnabled(requester);
    const current = await this.findScoped(id, requester, tenantId);
    if (dto.status === 'concluida' && current.status !== 'concluida') {
      return this.concluir(current, requester);
    }
    if (dto.status === 'aberta' && current.status === 'concluida') {
      const updated = await this.prisma.tarefa.update({
        where: { id },
        data: { status: 'aberta', concluidaEm: null, atrasoEnviadoEm: null },
        include: tarefaInclude,
      });
      return this.present(await this.attachEspelho(updated), new Date());
    }

    const merged: CreateTarefaDto = {
      titulo: dto.titulo ?? current.titulo,
      data: dto.data ?? current.data,
      responsavelId: dto.responsavelId ?? current.responsavelId,
      horario: dto.horario === undefined ? current.horario ?? undefined : dto.horario,
      prioridade: dto.prioridade ?? current.prioridade,
      descricao: dto.descricao ?? current.descricao,
      lembrete: dto.lembrete ?? current.lembrete,
      lembreteMinutos: dto.lembreteMinutos ?? current.lembreteMinutos ?? undefined,
      recorrencia: dto.recorrencia ?? current.recorrencia,
      diasSemana: dto.diasSemana ?? current.diasSemana,
      intervaloDias: dto.intervaloDias ?? current.intervaloDias ?? undefined,
      leadId: dto.leadId === undefined ? current.leadId ?? undefined : dto.leadId,
      agendamentoId:
        dto.agendamentoId === undefined
          ? current.agendamentoId ?? undefined
          : dto.agendamentoId,
      imovelId: dto.imovelId === undefined ? current.imovelId ?? undefined : dto.imovelId,
    };
    const data = await this.buildData(merged, tenantId, requester);
    const scheduleChanged =
      merged.data !== current.data ||
      (merged.horario ?? null) !== current.horario ||
      merged.lembrete !== current.lembrete ||
      (merged.lembreteMinutos ?? null) !== current.lembreteMinutos;
    const updated = await this.prisma.tarefa.update({
      where: { id },
      data: {
        ...data,
        ...(scheduleChanged
          ? { lembreteEnviadoEm: null, atrasoEnviadoEm: null }
          : {}),
      },
      include: tarefaInclude,
    });
    return this.present(await this.attachEspelho(updated), new Date());
  }

  async remove(id: string, requester: AuthenticatedUser) {
    const tenantId = await this.assertEnabled(requester);
    const current = await this.findScoped(id, requester, tenantId);
    await this.agenda.removeEspelhoTarefa(current.agendaEventoId);
    await this.prisma.tarefa.delete({ where: { id } });
    return { ok: true };
  }

  async comentar(
    id: string,
    dto: CreateComentarioDto,
    requester: AuthenticatedUser,
  ) {
    const tenantId = await this.assertEnabled(requester);
    await this.findScoped(id, requester, tenantId);
    return this.prisma.tarefaComentario.create({
      data: { tarefaId: id, autorId: requester.id, texto: dto.texto.trim() },
      include: { autor: { select: { id: true, name: true } } },
    });
  }

  private async concluir(
    current: Prisma.TarefaGetPayload<{ include: typeof tarefaInclude }>,
    requester: AuthenticatedUser,
  ) {
    const updated = await this.prisma.tarefa.update({
      where: { id: current.id },
      data: { status: 'concluida', concluidaEm: new Date() },
      include: tarefaInclude,
    });
    const next = nextData({
      data: current.data,
      recorrencia: current.recorrencia,
      diasSemana: current.diasSemana,
      intervaloDias: current.intervaloDias,
    });
    if (next && current.status === 'aberta') {
      const venceEm = venceEmFrom(next, current.horario);
      const occurrence = await this.prisma.tarefa.create({
        data: {
          tenantId: current.tenantId,
          titulo: current.titulo,
          descricao: current.descricao,
          data: next,
          horario: current.horario,
          venceEm,
          prioridade: current.prioridade,
          responsavelId: current.responsavelId,
          criadoPorId: requester.id,
          leadId: current.leadId,
          agendamentoId: current.agendamentoId,
          imovelId: current.imovelId,
          recorrencia: current.recorrencia,
          diasSemana: current.diasSemana,
          intervaloDias: current.intervaloDias,
          lembrete: current.lembrete,
          lembreteMinutos: current.lembreteMinutos,
          lembreteCanal: current.lembreteCanal,
          lembreteEm: lembreteEmFrom(
            venceEm,
            current.lembrete,
            current.lembreteMinutos,
          ),
          serieId: current.serieId ?? current.id,
        },
        include: tarefaInclude,
      });
      await this.attachEspelho(occurrence);
    }
    return this.present(await this.attachEspelho(updated), new Date());
  }

  private async buildData(
    dto: CreateTarefaDto,
    tenantId: string,
    requester: AuthenticatedUser,
  ) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dto.data) || Number.isNaN(venceEmFrom(dto.data).getTime())) {
      throw new BadRequestException('Data inválida.');
    }
    await this.assertResponsavel(requester, tenantId, dto.responsavelId);
    await this.assertVinculo(tenantId, dto.leadId, 'lead');
    await this.assertVinculo(tenantId, dto.agendamentoId, 'agendamento');
    await this.assertVinculo(tenantId, dto.imovelId, 'imovel');

    const recorrencia = (dto.recorrencia ?? 'nenhuma') as TarefaRecorrencia;
    const lembrete = (dto.lembrete ?? 'nenhum') as TarefaLembrete;
    if (recorrencia === 'personalizado' && !dto.intervaloDias) {
      throw new BadRequestException('Informe o intervalo da recorrência.');
    }
    if (recorrencia === 'dias_especificos' && !(dto.diasSemana?.length)) {
      throw new BadRequestException('Escolha ao menos um dia da semana.');
    }
    if (lembrete === 'personalizado' && dto.lembreteMinutos == null) {
      throw new BadRequestException('Informe quantos minutos antes avisar.');
    }

    const venceEm = venceEmFrom(dto.data, dto.horario);
    return {
      tenantId,
      titulo: dto.titulo.trim(),
      descricao: dto.descricao?.trim() ?? '',
      data: dto.data,
      horario: dto.horario ?? null,
      venceEm,
      prioridade: dto.prioridade ?? 'media',
      responsavelId: dto.responsavelId,
      leadId: dto.leadId ?? null,
      agendamentoId: dto.agendamentoId ?? null,
      imovelId: dto.imovelId ?? null,
      recorrencia,
      diasSemana: dto.diasSemana ?? [],
      intervaloDias: dto.intervaloDias ?? null,
      lembrete,
      lembreteMinutos: dto.lembreteMinutos ?? null,
      lembreteEm: lembreteEmFrom(venceEm, lembrete, dto.lembreteMinutos),
    };
  }

  private async assertVinculo(
    tenantId: string,
    id: string | undefined,
    kind: 'lead' | 'agendamento' | 'imovel',
  ) {
    if (!id) return;
    const found =
      kind === 'lead'
        ? await this.prisma.lead.findFirst({ where: { id, tenantId }, select: { id: true } })
        : kind === 'agendamento'
          ? await this.prisma.agendamento.findFirst({
              where: { id, tenantId },
              select: { id: true },
            })
          : await this.prisma.imovel.findFirst({
              where: { id, tenantId },
              select: { id: true },
            });
    if (!found) throw new BadRequestException('Registro relacionado não encontrado.');
  }

  private async attachEspelho(
    tarefa: Prisma.TarefaGetPayload<{ include: typeof tarefaInclude }>,
  ) {
    const agendaEventoId = await this.agenda.syncEspelhoTarefa({
      agendaEventoId: tarefa.agendaEventoId,
      tenantId: tarefa.tenantId,
      autorId: tarefa.criadoPorId,
      titulo: tarefa.titulo,
      descricao: tarefa.descricao,
      startsAt: tarefa.venceEm,
      responsavelId: tarefa.responsavelId,
      leadId: tarefa.leadId,
      imovelId: tarefa.imovelId,
      concluida: tarefa.status === 'concluida',
    });
    if (agendaEventoId === tarefa.agendaEventoId) return tarefa;
    return this.prisma.tarefa.update({
      where: { id: tarefa.id },
      data: { agendaEventoId },
      include: tarefaInclude,
    });
  }

  private async assertEnabled(requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { plano: true, tarefasEnabled: true },
    });
    if (!tenant || !tenantTemTarefas(tenant)) {
      throw new ForbiddenException(
        'Gestão de tarefas não está contratada para esta empresa.',
      );
    }
    return tenantId;
  }

  private async assertResponsavel(
    requester: AuthenticatedUser,
    tenantId: string,
    responsavelId: string,
  ) {
    const responsavel = await this.prisma.user.findFirst({
      where: { id: responsavelId, tenantId, status: 'ativo' },
      select: { id: true, role: true },
    });
    if (!responsavel) throw new BadRequestException('Responsável inválido.');
    if (VER_TODOS.has(requester.role) || responsavel.id === requester.id) return;

    if (requester.role === Role.gerente) {
      if (!isCorretorLike(responsavel.role)) {
        throw new ForbiddenException(
          'O gerente pode atribuir tarefas apenas a corretores e trainees.',
        );
      }
      const ids = await this.teamScope.getVisibleCorretorIds(requester);
      if (!ids?.includes(responsavel.id)) {
        throw new ForbiddenException(
          'Esse usuário não faz parte da sua equipe.',
        );
      }
      return;
    }

    throw new ForbiddenException('Você só pode criar tarefas para si.');
  }

  private async scopeWhere(
    requester: AuthenticatedUser,
    tenantId: string,
  ): Promise<Prisma.TarefaWhereInput> {
    if (VER_TODOS.has(requester.role)) return { tenantId };
    if (requester.role === Role.gerente) {
      const ids = (await this.teamScope.getVisibleCorretorIds(requester)) ?? [
        requester.id,
      ];
      return { tenantId, responsavelId: { in: ids } };
    }
    return {
      tenantId,
      OR: [{ responsavelId: requester.id }, { criadoPorId: requester.id }],
    };
  }

  private async findScoped(
    id: string,
    requester: AuthenticatedUser,
    tenantId: string,
  ) {
    const item = await this.prisma.tarefa.findFirst({
      where: { id, ...(await this.scopeWhere(requester, tenantId)) },
      include: tarefaInclude,
    });
    if (!item) throw new NotFoundException('Tarefa não encontrada.');
    return item;
  }

  private present(
    item: Prisma.TarefaGetPayload<{ include: typeof tarefaInclude }>,
    now: Date,
  ) {
    const atrasada =
      item.status === 'aberta' && item.venceEm.getTime() < now.getTime();
    const imovel = item.imovel
      ? [item.imovel.logradouro, item.imovel.numero, item.imovel.bairro, item.imovel.cidade]
          .filter(Boolean)
          .join(', ')
      : null;
    return {
      ...item,
      atrasada,
      contexto: {
        lead: item.lead ? { id: item.lead.id, nome: item.lead.nome } : null,
        atendimento: item.agendamento
          ? { id: item.agendamento.id, titulo: item.agendamento.titulo }
          : null,
        imovel: item.imovel ? { id: item.imovel.id, rotulo: imovel } : null,
      },
    };
  }

  private async dispatchEmails() {
    const now = new Date();
    const reminders = await this.prisma.tarefa.findMany({
      where: {
        status: 'aberta',
        lembreteEnviadoEm: null,
        lembreteEm: { lte: now },
        tenant: {
          OR: [
            { tarefasEnabled: true },
            { plano: { in: ['prata', 'ouro'] } },
          ],
        },
      },
      include: tarefaInclude,
      take: 40,
    });
    for (const tarefa of reminders) {
      const sent = await this.sendTarefaEmail(tarefa, 'lembrete');
      if (sent) {
        await this.prisma.tarefa.update({
          where: { id: tarefa.id },
          data: { lembreteEnviadoEm: new Date() },
        });
      }
    }

    const overdue = await this.prisma.tarefa.findMany({
      where: {
        status: 'aberta',
        atrasoEnviadoEm: null,
        venceEm: { lt: now },
        tenant: {
          OR: [
            { tarefasEnabled: true },
            { plano: { in: ['prata', 'ouro'] } },
          ],
        },
      },
      include: tarefaInclude,
      take: 40,
    });
    for (const tarefa of overdue) {
      const sent = await this.sendTarefaEmail(tarefa, 'atraso');
      if (sent) {
        await this.prisma.tarefa.update({
          where: { id: tarefa.id },
          data: { atrasoEnviadoEm: new Date() },
        });
      }
    }
  }

  private async sendTarefaEmail(
    tarefa: Prisma.TarefaGetPayload<{ include: typeof tarefaInclude }>,
    kind: 'lembrete' | 'atraso',
  ) {
    const to = resolveNotifyEmail(tarefa.responsavel);
    if (!to || !this.mailer.isConfigured()) return true;
    const when = tarefa.horario
      ? `${this.formatData(tarefa.data)} às ${tarefa.horario}`
      : this.formatData(tarefa.data);
    const linhas = [
      kind === 'lembrete'
        ? 'Você possui uma tarefa próxima:'
        : 'Esta tarefa passou do prazo e ainda não foi concluída:',
      '',
      tarefa.titulo,
      when,
    ];
    if (tarefa.lead) linhas.push(`Cliente: ${tarefa.lead.nome}`);
    if (tarefa.imovel) {
      const rotulo = [
        tarefa.imovel.logradouro,
        tarefa.imovel.numero,
        tarefa.imovel.bairro,
      ]
        .filter(Boolean)
        .join(', ');
      if (rotulo) linhas.push(`Imóvel: ${rotulo}`);
    }
    if (tarefa.agendamento) linhas.push(`Atendimento: ${tarefa.agendamento.titulo}`);
    const url = this.taskUrl(tarefa.id);
    linhas.push('', url);
    const subject =
      kind === 'lembrete'
        ? `Lembrete: ${tarefa.titulo}${tarefa.horario ? ` às ${tarefa.horario}` : ''}`
        : `Tarefa atrasada: ${tarefa.titulo}`;
    try {
      await this.mailer.sendText({
        to,
        subject,
        text: linhas.join('\n'),
      });
      return true;
    } catch {
      return false;
    }
  }

  private formatData(ymd: string) {
    const [y, m, d] = ymd.split('-');
    return `${d}/${m}/${y}`;
  }

  private taskUrl(id: string) {
    const raw = this.config.get<string>('FRONTEND_URL') ?? '';
    const origin = raw.split(',')[0]?.trim().replace(/\/$/, '') || '';
    return origin ? `${origin}/tarefas?tarefa=${id}` : `/tarefas?tarefa=${id}`;
  }
}
