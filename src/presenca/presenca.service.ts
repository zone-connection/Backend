import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PresencaNatureza, Role } from '@prisma/client';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_TIPOS: Array<{
  nome: string;
  sigla: string;
  natureza: PresencaNatureza;
  cor: string;
  sortOrder: number;
}> = [
  { nome: 'Presença', sigla: 'P', natureza: 'presente', cor: '#059669', sortOrder: 0 },
  {
    nome: 'Meio período',
    sigla: 'MP',
    natureza: 'meio_periodo',
    cor: '#0284c7',
    sortOrder: 1,
  },
  { nome: 'Falta', sigla: 'F', natureza: 'falta', cor: '#e11d48', sortOrder: 2 },
  {
    nome: 'Falta justificada',
    sigla: 'FJ',
    natureza: 'falta_justificada',
    cor: '#d97706',
    sortOrder: 3,
  },
];

function dayUtc(iso: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    throw new BadRequestException('Data inválida. Use AAAA-MM-DD.');
  }
  return new Date(`${iso}T12:00:00.000Z`);
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function monthBounds(ano: number, mes: number) {
  const start = new Date(Date.UTC(ano, mes - 1, 1, 12, 0, 0));
  const end = new Date(Date.UTC(ano, mes, 0, 12, 0, 0));
  const days: string[] = [];
  for (let day = 1; day <= end.getUTCDate(); day++) {
    days.push(ymd(new Date(Date.UTC(ano, mes - 1, day, 12, 0, 0))));
  }
  return { start, end, days };
}

function prevMonth(ano: number, mes: number) {
  if (mes === 1) return { ano: ano - 1, mes: 12 };
  return { ano, mes: mes - 1 };
}

function peso(natureza: PresencaNatureza): number {
  if (natureza === 'presente') return 1;
  if (natureza === 'meio_periodo') return 0.5;
  return 0;
}

function veio(natureza: PresencaNatureza): boolean {
  return natureza === 'presente' || natureza === 'meio_periodo';
}

function tipoAplica(roles: string[], role: string): boolean {
  return roles.length === 0 || roles.includes(role);
}

@Injectable()
export class PresencaService {
  constructor(private readonly prisma: PrismaService) {}

  private assertTenant(user: AuthenticatedUser) {
    if (!user.tenantId) throw new ForbiddenException('Tenant obrigatório.');
    return user.tenantId;
  }

  private podeEditar(role: Role) {
    return role === Role.admin || role === Role.gerente || role === Role.super_admin;
  }

  private podeTipos(role: Role) {
    return role === Role.admin || role === Role.super_admin;
  }

  async ensureDefaults(tenantId: string) {
    const count = await this.prisma.presencaTipo.count({ where: { tenantId } });
    if (count > 0) return;
    await this.prisma.presencaTipo.createMany({
      data: DEFAULT_TIPOS.map((t) => ({ ...t, tenantId, padrao: true, roles: [] })),
    });
  }

  private async visibleUserIds(requester: AuthenticatedUser): Promise<string[] | null> {
    if (
      requester.role === Role.admin ||
      requester.role === Role.super_admin
    ) {
      return null;
    }
    if (requester.role === Role.gerente) {
      const users = await this.prisma.user.findMany({
        where: {
          tenantId: requester.tenantId!,
          OR: [
            { id: requester.id },
            { equipe: { gerenteId: requester.id } },
          ],
        },
        select: { id: true },
      });
      return users.map((u) => u.id);
    }
    return [requester.id];
  }

  async listTipos(requester: AuthenticatedUser) {
    const tenantId = this.assertTenant(requester);
    await this.ensureDefaults(tenantId);
    return this.prisma.presencaTipo.findMany({
      where: { tenantId },
      orderBy: [{ sortOrder: 'asc' }, { nome: 'asc' }],
    });
  }

  async createTipo(dto: {
    nome: string;
    sigla: string;
    natureza: PresencaNatureza;
    cor?: string;
    sortOrder?: number;
    ativo?: boolean;
    roles?: string[];
  }, requester: AuthenticatedUser) {
    if (!this.podeTipos(requester.role)) {
      throw new ForbiddenException('Só o administrador pode cadastrar tipos.');
    }
    const tenantId = this.assertTenant(requester);
    await this.ensureDefaults(tenantId);
    return this.prisma.presencaTipo.create({
      data: {
        tenantId,
        nome: dto.nome.trim(),
        sigla: dto.sigla.trim().toUpperCase(),
        natureza: dto.natureza,
        cor: dto.cor?.trim() || '#64748b',
        sortOrder: dto.sortOrder ?? 99,
        ativo: dto.ativo ?? true,
        padrao: false,
        roles: dto.roles ?? [],
      },
    });
  }

  async updateTipo(
    id: string,
    dto: {
      nome?: string;
      sigla?: string;
      natureza?: PresencaNatureza;
      cor?: string;
      sortOrder?: number;
      ativo?: boolean;
      roles?: string[];
    },
    requester: AuthenticatedUser,
  ) {
    if (!this.podeTipos(requester.role)) {
      throw new ForbiddenException('Só o administrador pode editar tipos.');
    }
    const tenantId = this.assertTenant(requester);
    const tipo = await this.prisma.presencaTipo.findFirst({ where: { id, tenantId } });
    if (!tipo) throw new NotFoundException('Tipo não encontrado.');
    return this.prisma.presencaTipo.update({
      where: { id },
      data: {
        ...(dto.nome != null ? { nome: dto.nome.trim() } : {}),
        ...(dto.sigla != null ? { sigla: dto.sigla.trim().toUpperCase() } : {}),
        ...(dto.natureza != null ? { natureza: dto.natureza } : {}),
        ...(dto.cor != null ? { cor: dto.cor.trim() } : {}),
        ...(dto.sortOrder != null ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.ativo != null ? { ativo: dto.ativo } : {}),
        ...(dto.roles != null ? { roles: dto.roles } : {}),
      },
    });
  }

  async removeTipo(id: string, requester: AuthenticatedUser) {
    if (!this.podeTipos(requester.role)) {
      throw new ForbiddenException('Só o administrador pode excluir tipos.');
    }
    const tenantId = this.assertTenant(requester);
    const tipo = await this.prisma.presencaTipo.findFirst({ where: { id, tenantId } });
    if (!tipo) throw new NotFoundException('Tipo não encontrado.');
    const used = await this.prisma.presencaLancamento.count({ where: { tipoId: id } });
    if (used > 0) {
      throw new BadRequestException(
        'Este tipo já foi usado em lançamentos. Desative-o em vez de excluir.',
      );
    }
    await this.prisma.presencaTipo.delete({ where: { id } });
    return { ok: true };
  }

  async mes(
    ano: number,
    mes: number,
    requester: AuthenticatedUser,
    requestedUserIds: string[] = [],
  ) {
    if (mes < 1 || mes > 12 || ano < 2000 || ano > 2100) {
      throw new BadRequestException('Mês ou ano inválido.');
    }
    const tenantId = this.assertTenant(requester);
    await this.ensureDefaults(tenantId);
    const tipos = await this.prisma.presencaTipo.findMany({
      where: { tenantId, ativo: true },
      orderBy: [{ sortOrder: 'asc' }, { nome: 'asc' }],
    });
    const visible = await this.visibleUserIds(requester);
    const userFilter = this.resolveUserFilter(visible, requestedUserIds);
    const current = await this.loadGrid(tenantId, ano, mes, userFilter);
    const prev = prevMonth(ano, mes);
    const previous = await this.loadGrid(tenantId, prev.ano, prev.mes, userFilter);
    const prevByUser = new Map(previous.grid.map((u) => [u.userId, u]));

    const comparativoUsuarios = current.grid.map((u) => ({
      userId: u.userId,
      nome: u.nome,
      role: u.role,
      equipe: u.equipe,
      atual: this.totaisFromDias(current.days, u.dias),
      anterior: this.totaisFromDias(
        previous.days,
        prevByUser.get(u.userId)?.dias ?? {},
      ),
    }));

    return {
      ano,
      mes,
      dias: current.days,
      tipos,
      podeEditar: this.podeEditar(requester.role),
      podeTipos: this.podeTipos(requester.role),
      usuarios: current.grid,
      comparativoUsuarios,
      resumo: this.buildResumo(current.days, current.grid),
      resumoAnterior: {
        ano: prev.ano,
        mes: prev.mes,
        ...this.buildResumo(previous.days, previous.grid),
      },
    };
  }

  private resolveUserFilter(
    visible: string[] | null,
    requested: string[],
  ): string[] | null {
    if (!requested.length) return visible;
    if (!visible) return requested;
    const allow = new Set(visible);
    return requested.filter((id) => allow.has(id));
  }

  private totaisFromDias(
    days: string[],
    dias: Record<string, { natureza: PresencaNatureza } | null>,
  ) {
    let presentes = 0;
    let equivalente = 0;
    let faltas = 0;
    let justificadas = 0;
    let lancamentos = 0;
    for (const d of days) {
      const cell = dias[d];
      if (!cell) continue;
      lancamentos += 1;
      if (veio(cell.natureza)) presentes += 1;
      equivalente += peso(cell.natureza);
      if (cell.natureza === 'falta') faltas += 1;
      if (cell.natureza === 'falta_justificada') justificadas += 1;
    }
    return {
      presentes,
      equivalente: Math.round(equivalente * 100) / 100,
      faltas,
      justificadas,
      lancamentos,
    };
  }

  private async loadGrid(
    tenantId: string,
    ano: number,
    mes: number,
    userFilter: string[] | null,
  ) {
    const { start, end, days } = monthBounds(ano, mes);
    const users = await this.prisma.user.findMany({
      where: {
        tenantId,
        status: 'ativo',
        ...(userFilter ? { id: { in: userFilter } } : {}),
      },
      select: {
        id: true,
        name: true,
        role: true,
        equipe: { select: { id: true, name: true } },
      },
      orderBy: { name: 'asc' },
    });
    const lancamentos = await this.prisma.presencaLancamento.findMany({
      where: {
        tenantId,
        data: { gte: start, lte: end },
        ...(userFilter ? { userId: { in: userFilter } } : {}),
      },
      include: { tipo: true },
    });
    const byKey = new Map(
      lancamentos.map((l) => [`${l.userId}|${ymd(l.data)}`, l] as const),
    );
    const grid = users.map((u) => ({
      userId: u.id,
      nome: u.name,
      role: u.role,
      equipe: u.equipe?.name ?? null,
      dias: Object.fromEntries(
        days.map((d) => {
          const l = byKey.get(`${u.id}|${d}`);
          return [
            d,
            l
              ? {
                  id: l.id,
                  tipoId: l.tipoId,
                  sigla: l.tipo.sigla,
                  nome: l.tipo.nome,
                  cor: l.tipo.cor,
                  natureza: l.tipo.natureza,
                  observacao: l.observacao,
                }
              : null,
          ];
        }),
      ),
    }));
    return { days, grid };
  }

  private buildResumo(
    days: string[],
    grid: Array<{
      dias: Record<
        string,
        { natureza: PresencaNatureza } | null
      >;
    }>,
  ) {
    const porDia = days.map((d) => {
      let vieram = 0;
      let equivalente = 0;
      let faltas = 0;
      let justificadas = 0;
      for (const u of grid) {
        const cell = u.dias[d];
        if (!cell) continue;
        if (veio(cell.natureza)) vieram += 1;
        equivalente += peso(cell.natureza);
        if (cell.natureza === 'falta') faltas += 1;
        if (cell.natureza === 'falta_justificada') justificadas += 1;
      }
      return { data: d, vieram, equivalente, faltas, justificadas };
    });
    const n = days.length || 1;
    const mediaVieram = porDia.reduce((s, x) => s + x.vieram, 0) / n;
    const mediaEquivalente = porDia.reduce((s, x) => s + x.equivalente, 0) / n;
    return {
      porDia,
      mediaVieram: Math.round(mediaVieram * 100) / 100,
      mediaEquivalente: Math.round(mediaEquivalente * 100) / 100,
      totalVieramDia: porDia.reduce((s, x) => s + x.vieram, 0),
    };
  }

  async upsertLancamento(
    dto: { userId: string; data: string; tipoId?: string | null; observacao?: string },
    requester: AuthenticatedUser,
  ) {
    if (!this.podeEditar(requester.role)) {
      throw new ForbiddenException('Sem permissão para lançar presença.');
    }
    const tenantId = this.assertTenant(requester);
    const visible = await this.visibleUserIds(requester);
    if (visible && !visible.includes(dto.userId)) {
      throw new ForbiddenException('Usuário fora da sua equipe.');
    }
    const target = await this.prisma.user.findFirst({
      where: { id: dto.userId, tenantId },
    });
    if (!target) throw new NotFoundException('Usuário não encontrado.');
    const data = dayUtc(dto.data);

    if (!dto.tipoId) {
      await this.prisma.presencaLancamento.deleteMany({
        where: { tenantId, userId: dto.userId, data },
      });
      return { ok: true, cleared: true };
    }

    const tipo = await this.prisma.presencaTipo.findFirst({
      where: { id: dto.tipoId, tenantId, ativo: true },
    });
    if (!tipo) throw new NotFoundException('Tipo não encontrado.');
    if (!tipoAplica(tipo.roles, target.role)) {
      throw new BadRequestException('Este tipo não se aplica à função do usuário.');
    }

    return this.prisma.presencaLancamento.upsert({
      where: {
        tenantId_userId_data: { tenantId, userId: dto.userId, data },
      },
      create: {
        tenantId,
        userId: dto.userId,
        data,
        tipoId: tipo.id,
        observacao: dto.observacao?.trim() ?? '',
      },
      update: {
        tipoId: tipo.id,
        observacao: dto.observacao?.trim() ?? '',
      },
      include: { tipo: true },
    });
  }
}
