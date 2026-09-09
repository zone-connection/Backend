import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CreciProcessoStatus,
  Prisma,
  Role,
  TenantPlano,
  UserStatus,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { TeamScopeService } from '../equipes/team-scope.service';
import {
  PresenceService,
  type UserPresenceToday,
  type UserPresenceWeek,
} from '../presence/presence.service';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { requireTenantId } from '../common/utils/tenant';
import { isCorretorLike } from '../common/utils/roles';
import { prismaTableOrderBy } from '../common/utils/table-sort';
import { publicUserSelect, PublicUser } from '../common/utils/user-select';
import { normalizeCor } from '../common/utils/cor';
import { SALT_ROUNDS } from '../config/security.constants';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { QueryUsersDto } from './dto/query-users.dto';
import { assertRoleAllowedForPlano, PLANO_MAX_USUARIOS } from '../tenants/tenant-plan';
import { sanitizeUserPermissions } from '../common/utils/user-permissions';

export interface PaginatedUsers {
  data: PublicUser[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

/** YYYY-MM-DD → meio-dia UTC (evita deslocar o dia em BRT). */
function parseDataNascimento(
  value?: string | null,
): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const raw = value.trim();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? new Date(`${raw}T12:00:00.000Z`)
    : new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException('Data de nascimento inválida.');
  }
  return date;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teamScope: TeamScopeService,
    private readonly presence: PresenceService,
  ) {}

  async create(
    dto: CreateUserDto,
    requester: AuthenticatedUser,
  ): Promise<PublicUser> {
    const tenantId = requireTenantId(requester);

    if (dto.role === Role.super_admin) {
      throw new ForbiddenException(
        'Não é possível criar usuários da plataforma por este endpoint.',
      );
    }

    this.assertCanCreateRole(requester, dto.role);
    await this.assertCanCreateUser(tenantId);
    await this.assertRoleAllowed(tenantId, dto.role);
    if (dto.role === Role.admin) {
      await this.assertCanAddAdmin(tenantId);
    }

    const email = dto.email.toLowerCase().trim();
    await this.ensureEmailIsAvailable(tenantId, email);

    const creci = dto.creci?.trim() || null;
    const creciStatus =
      dto.creciStatus ??
      (creci
        ? CreciProcessoStatus.creci_recebido
        : CreciProcessoStatus.nao_iniciado);
    this.assertCreciProcesso(creciStatus, creci);

    return this.prisma.user.create({
      data: {
        tenantId,
        name: dto.name.trim(),
        email,
        password: await bcrypt.hash(dto.password, SALT_ROUNDS),
        phone: dto.phone,
        whatsapp: dto.whatsapp,
        dataNascimento: parseDataNascimento(dto.dataNascimento) ?? null,
        cargo: dto.cargo,
        creci,
        creciStatus,
        cor: normalizeCor(dto.cor),
        role: dto.role,
        status: dto.status ?? UserStatus.ativo,
        avatar: dto.avatar,
        permissions:
          dto.permissions !== undefined
            ? sanitizeUserPermissions(dto.permissions)
            : undefined,
        financeiroCanView: true,
        financeiroCanCreate:
          dto.role === Role.financeiro ? dto.financeiroCanCreate !== false : true,
        financeiroCanEdit:
          dto.role === Role.financeiro ? dto.financeiroCanEdit !== false : true,
        financeiroCanDelete:
          dto.role === Role.financeiro ? dto.financeiroCanDelete !== false : true,
      },
      select: publicUserSelect,
    });
  }

  /** Cota de usuários do tenant do requester. */
  async getQuota(requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        plano: true,
        maxUsuarios: true,
        usuariosExtras: true,
        iaBotEnabled: true,
      },
    });
    if (!tenant) {
      throw new NotFoundException('Tenant não encontrado.');
    }
    const used = await this.prisma.user.count({ where: { tenantId } });
    const maxUsuarios =
      tenant.plano === TenantPlano.solo
        ? Math.max(tenant.maxUsuarios, PLANO_MAX_USUARIOS[TenantPlano.solo])
        : tenant.maxUsuarios;
    const limit = maxUsuarios + tenant.usuariosExtras;
    return {
      plano: tenant.plano,
      maxUsuarios,
      usuariosExtras: tenant.usuariosExtras,
      limite: limit,
      usados: used,
      restantes: Math.max(0, limit - used),
      iaBotEnabled: tenant.iaBotEnabled,
    };
  }

  private async assertCanCreateUser(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { maxUsuarios: true, usuariosExtras: true, plano: true },
    });
    if (!tenant) {
      throw new NotFoundException('Tenant não encontrado.');
    }
    const used = await this.prisma.user.count({ where: { tenantId } });
    const maxUsuarios =
      tenant.plano === TenantPlano.solo
        ? Math.max(tenant.maxUsuarios, PLANO_MAX_USUARIOS[TenantPlano.solo])
        : tenant.maxUsuarios;
    const limit = maxUsuarios + tenant.usuariosExtras;
    if (used >= limit) {
      throw new ForbiddenException(
        `Limite de usuários do plano atingido (${used}/${limit}). Peça ao administrador da plataforma para liberar usuários extras.`,
      );
    }
  }

  private assertCanCreateRole(requester: AuthenticatedUser, role: Role) {
    if (requester.role === Role.admin) return;

    if (
      (requester.role === Role.gerente || requester.role === Role.analista) &&
      role === Role.corretor
    ) {
      return;
    }

    throw new ForbiddenException(
      'Gerentes e analistas podem cadastrar somente usuários corretores.',
    );
  }

  private assertCreciProcesso(
    status: CreciProcessoStatus,
    creci: string | null,
  ) {
    if (status === CreciProcessoStatus.creci_recebido && !creci?.trim()) {
      throw new BadRequestException(
        'Informe o número do CRECI ao marcar a etapa como recebido.',
      );
    }
  }

  private async assertRoleAllowed(tenantId: string, role: Role) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { plano: true, modules: true },
    });
    if (!tenant) {
      throw new NotFoundException('Tenant não encontrado.');
    }

    if (tenant.plano === TenantPlano.solo) {
      if (role !== Role.assistente && role !== Role.admin) {
        throw new ForbiddenException(
          'No plano Solo o usuário extra deve ser Assistente.',
        );
      }
      return;
    }

    if (role === Role.assistente) {
      throw new ForbiddenException(
        'O perfil Assistente é exclusivo do plano Solo.',
      );
    }

    if (
      role !== Role.analista &&
      role !== Role.gerente &&
      role !== Role.financeiro
    ) {
      return;
    }

    const message = assertRoleAllowedForPlano(
      tenant.plano,
      role,
      tenant.modules as Record<string, boolean> | null,
    );
    if (message) {
      throw new ForbiddenException(message);
    }
  }

  async findAll(
    query: QueryUsersDto,
    requester: AuthenticatedUser,
  ): Promise<PaginatedUsers> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const teamFilter = await this.teamUserFilter(requester);

    const where: Prisma.UserWhereInput = {
      ...teamFilter,
      ...(query.role ? { role: query.role } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
              { cargo: { contains: query.search, mode: 'insensitive' } },
              { phone: { contains: query.search, mode: 'insensitive' } },
              { creci: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(query.comCreci
        ? {
            AND: [{ creci: { not: null } }, { NOT: { creci: '' } }],
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: publicUserSelect,
        orderBy: prismaTableOrderBy(query.sort, 'name'),
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  /** Tempo logado no dia (America/Sao_Paulo) dos usuários visíveis ao requester. */
  async presenceToday(
    requester: AuthenticatedUser,
  ): Promise<{ data: UserPresenceToday[] }> {
    const tenantId = requireTenantId(requester);
    const teamFilter = await this.teamUserFilter(requester);
    const users = await this.prisma.user.findMany({
      where: teamFilter,
      select: { id: true },
    });
    const data = await this.presence.summarizeToday(
      tenantId,
      users.map((u) => u.id),
    );
    return { data };
  }

  /** Tempo logado na semana (seg–dom) de um usuário visível ao requester. */
  async presenceWeek(
    id: string,
    requester: AuthenticatedUser,
  ): Promise<UserPresenceWeek> {
    const tenantId = requireTenantId(requester);
    const user = await this.prisma.user.findFirst({
      where: { id, tenantId },
      select: publicUserSelect,
    });
    if (!user) {
      throw new NotFoundException('Usuário não encontrado.');
    }
    await this.ensureCanViewUser(requester, user);
    return this.presence.summarizeWeekByDay(tenantId, id);
  }

  async findOne(
    id: string,
    requester: AuthenticatedUser,
  ): Promise<PublicUser> {
    const tenantId = requireTenantId(requester);
    const user = await this.prisma.user.findFirst({
      where: { id, tenantId },
      select: publicUserSelect,
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado.');
    }

    await this.ensureCanViewUser(requester, user);
    return user;
  }

  async update(
    id: string,
    dto: UpdateUserDto,
    requester: AuthenticatedUser,
  ): Promise<PublicUser> {
    const tenantId = requireTenantId(requester);
    await this.ensureExists(id, tenantId);

    const email = dto.email?.toLowerCase().trim();
    if (email) {
      await this.ensureEmailIsAvailable(tenantId, email, id);
    }

    if (dto.role !== undefined) {
      await this.assertRoleAllowed(tenantId, dto.role);
      if (dto.role === Role.admin) {
        const current = await this.prisma.user.findFirst({
          where: { id, tenantId },
          select: { role: true },
        });
        if (current?.role !== Role.admin) {
          await this.assertCanAddAdmin(tenantId);
        }
      }
    }

    const dataNascimento =
      dto.dataNascimento !== undefined
        ? parseDataNascimento(dto.dataNascimento)
        : undefined;

    const creci =
      dto.creci !== undefined
        ? dto.creci?.trim()
          ? dto.creci.trim()
          : null
        : undefined;
    const creciStatus = dto.creciStatus;
    if (creciStatus !== undefined || creci !== undefined) {
      const current = await this.prisma.user.findFirst({
        where: { id, tenantId },
        select: { creci: true, creciStatus: true },
      });
      this.assertCreciProcesso(
        creciStatus ?? current?.creciStatus ?? CreciProcessoStatus.nao_iniciado,
        creci !== undefined ? creci : (current?.creci ?? null),
      );
    }

    return this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(email ? { email } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.whatsapp !== undefined ? { whatsapp: dto.whatsapp } : {}),
        ...(dataNascimento !== undefined ? { dataNascimento } : {}),
        ...(dto.cargo !== undefined ? { cargo: dto.cargo } : {}),
        ...(creci !== undefined ? { creci } : {}),
        ...(creciStatus !== undefined ? { creciStatus } : {}),
        ...(dto.cor !== undefined ? { cor: normalizeCor(dto.cor) } : {}),
        ...(dto.role !== undefined ? { role: dto.role } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.avatar !== undefined ? { avatar: dto.avatar } : {}),
        ...(dto.financeiroCanView !== undefined
          ? { financeiroCanView: true }
          : {}),
        ...(dto.financeiroCanCreate !== undefined
          ? { financeiroCanCreate: dto.financeiroCanCreate }
          : {}),
        ...(dto.financeiroCanEdit !== undefined
          ? { financeiroCanEdit: dto.financeiroCanEdit }
          : {}),
        ...(dto.financeiroCanDelete !== undefined
          ? { financeiroCanDelete: dto.financeiroCanDelete }
          : {}),
        ...(dto.permissions !== undefined
          ? { permissions: sanitizeUserPermissions(dto.permissions) }
          : {}),
      },
      select: publicUserSelect,
    });
  }

  async remove(id: string, requester: AuthenticatedUser): Promise<void> {
    const tenantId = requireTenantId(requester);
    if (id === requester.id) {
      throw new ForbiddenException('Você não pode excluir a própria conta.');
    }

    const target = await this.prisma.user.findFirst({
      where: { id, tenantId },
      select: { ...publicUserSelect },
    });
    if (!target) {
      throw new NotFoundException('Usuário não encontrado.');
    }

    await this.ensureCanDeleteUser(requester, target);

    if (target.role === Role.admin) {
      const otherAdmins = await this.prisma.user.count({
        where: {
          tenantId,
          role: Role.admin,
          id: { not: id },
          status: UserStatus.ativo,
        },
      });
      if (otherAdmins === 0) {
        throw new BadRequestException(
          'Não é possível excluir o último administrador da conta.',
        );
      }
    }

    const equipeGerenciada = await this.prisma.equipe.findFirst({
      where: { tenantId, gerenteId: id },
      select: { id: true, name: true },
    });
    if (equipeGerenciada) {
      throw new BadRequestException(
        `Este usuário é gerente da equipe "${equipeGerenciada.name}". Troque o gerente da equipe ou remova a equipe antes de excluí-lo.`,
      );
    }

    const comissoes = await this.prisma.financeiroComissao.count({
      where: { tenantId, corretorId: id },
    });
    if (comissoes > 0) {
      throw new BadRequestException(
        'Este usuário possui comissões vinculadas. Inative a conta em vez de excluir, para preservar o histórico financeiro.',
      );
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await this.detachUserReferences(tx, id, requester.id);
        await tx.user.delete({ where: { id } });
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2003'
      ) {
        throw new BadRequestException(
          'Não foi possível excluir: há registros vinculados a este usuário. Inative a conta ou remova os vínculos primeiro.',
        );
      }
      throw err;
    }
  }

  async updateStatus(
    id: string,
    status: UserStatus,
    requester: AuthenticatedUser,
  ): Promise<PublicUser> {
    const tenantId = requireTenantId(requester);
    if (id === requester.id && status === UserStatus.inativo) {
      throw new ForbiddenException('Você não pode inativar a própria conta.');
    }
    await this.ensureExists(id, tenantId);

    if (status === UserStatus.inativo) {
      await this.presence.closeOpenSegments(id);
    }

    return this.prisma.user.update({
      where: { id },
      data: {
        status,
        ...(status === UserStatus.inativo
          ? { hashedRefreshToken: null }
          : { failedLoginAttempts: 0, lockedUntil: null }),
      },
      select: publicUserSelect,
    });
  }

  /** Libera manualmente uma conta bloqueada por excesso de tentativas. */
  async unlock(
    id: string,
    requester: AuthenticatedUser,
  ): Promise<PublicUser> {
    const tenantId = requireTenantId(requester);
    await this.ensureExists(id, tenantId);

    const user = await this.prisma.user.update({
      where: { id },
      data: { failedLoginAttempts: 0, lockedUntil: null },
      select: publicUserSelect,
    });

    await this.prisma.loginAttempt.deleteMany({
      where: { email: user.email, success: false },
    });

    return user;
  }

  /**
   * Admin ou gerente redefine a senha.
   * Retorna a senha temporária gerada (única vez em que ela fica legível).
   */
  async resetPassword(
    id: string,
    password: string | undefined,
    requester: AuthenticatedUser,
  ): Promise<{ user: PublicUser; temporaryPassword?: string }> {
    const tenantId = requireTenantId(requester);
    const target = await this.prisma.user.findFirst({
      where: { id, tenantId },
      select: { ...publicUserSelect },
    });
    if (!target) {
      throw new NotFoundException('Usuário não encontrado.');
    }

    await this.ensureCanResetPassword(requester, target);

    const temporaryPassword = password ? undefined : this.generatePassword();
    const finalPassword = password ?? temporaryPassword!;

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        password: await bcrypt.hash(finalPassword, SALT_ROUNDS),
        hashedRefreshToken: null,
        passwordResetToken: null,
        passwordResetExpires: null,
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
      select: publicUserSelect,
    });

    return { user, temporaryPassword };
  }

  /** Gerente: só membros da própria equipe (+ ele mesmo). Admin: todos do tenant. */
  private async teamUserFilter(
    requester: AuthenticatedUser,
  ): Promise<Prisma.UserWhereInput> {
    const tenantId = requireTenantId(requester);

    if (requester.role === Role.admin) {
      return { tenantId };
    }

    if (requester.role === Role.analista) {
      return { tenantId, role: Role.corretor };
    }

    if (requester.role !== Role.gerente) {
      throw new ForbiddenException('Acesso negado.');
    }

    const corretorIds = await this.teamScope.getVisibleCorretorIds(requester);
    const ids = [...(corretorIds ?? []), requester.id];

    return { tenantId, id: { in: ids } };
  }

  private async ensureCanViewUser(
    requester: AuthenticatedUser,
    user: PublicUser,
  ): Promise<void> {
    if (requester.role === Role.admin) return;
    if (requester.role === Role.analista) {
      if (user.role === Role.corretor) return;
      throw new NotFoundException('Usuário não encontrado.');
    }

    if (requester.role !== Role.gerente) {
      throw new ForbiddenException('Acesso negado.');
    }
    if (user.id === requester.id) return;

    if (!isCorretorLike(user.role)) {
      throw new NotFoundException('Usuário não encontrado.');
    }

    const allowed = await this.teamScope.canAccessCorretor(
      requester,
      user.id,
    );
    if (!allowed) {
      throw new NotFoundException('Usuário não encontrado.');
    }
  }

  private async ensureCanResetPassword(
    requester: AuthenticatedUser,
    user: PublicUser,
  ): Promise<void> {
    if (requester.role === Role.admin) return;

    if (requester.role !== Role.gerente) {
      throw new ForbiddenException('Acesso negado.');
    }

    // Gerente só reseta senha de corretores da própria equipe (não a própria
    // via este endpoint administrativo — usa perfil / change-password).
    if (!isCorretorLike(user.role)) {
      throw new ForbiddenException(
        'Você só pode redefinir senha de corretores e treinees da sua equipe.',
      );
    }

    const allowed = await this.teamScope.canAccessCorretor(
      requester,
      user.id,
    );
    if (!allowed) {
      throw new ForbiddenException(
        'Você só pode redefinir senha de corretores da sua equipe.',
      );
    }
  }

  /** Admin: qualquer usuário do tenant. Gerente: só corretor/treinee da equipe. */
  private async ensureCanDeleteUser(
    requester: AuthenticatedUser,
    user: PublicUser,
  ): Promise<void> {
    if (requester.role === Role.admin) return;

    if (requester.role !== Role.gerente) {
      throw new ForbiddenException('Acesso negado.');
    }

    if (!isCorretorLike(user.role)) {
      throw new ForbiddenException(
        'Você só pode excluir corretores e treinees da sua equipe.',
      );
    }

    const allowed = await this.teamScope.canAccessCorretor(
      requester,
      user.id,
    );
    if (!allowed) {
      throw new ForbiddenException(
        'Você só pode excluir corretores da sua equipe.',
      );
    }
  }

  /** Solo tem um único administrador — o extra entra como Assistente. */
  private async assertCanAddAdmin(tenantId: string): Promise<void> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { plano: true },
    });
    if (!tenant || tenant.plano !== TenantPlano.solo) return;

    const admins = await this.prisma.user.count({
      where: { tenantId, role: Role.admin },
    });
    if (admins >= 1) {
      throw new ForbiddenException(
        'O plano Solo permite apenas um administrador. Cadastre o usuário extra como Assistente.',
      );
    }
  }

  /**
   * Solta FKs que impedem o DELETE (metas, agenda, autoria) e apaga dados pessoais.
   * Histórico comercial permanece, apontando para quem excluiu quando a coluna é obrigatória.
   */
  private async detachUserReferences(
    tx: Prisma.TransactionClient,
    userId: string,
    fallbackUserId: string,
  ): Promise<void> {
    await tx.notificacao.deleteMany({ where: { userId } });
    await tx.userSessionSegment.deleteMany({ where: { userId } });
    await tx.userGoogleCalendar.deleteMany({ where: { userId } });

    await tx.lead.updateMany({
      where: { corretorId: userId },
      data: { corretorId: null },
    });
    await tx.lead.updateMany({
      where: { perdidoPorId: userId },
      data: { perdidoPorId: null },
    });

    await tx.documentacao.updateMany({
      where: { corretorId: userId },
      data: { corretorId: null },
    });
    await tx.documentacao.updateMany({
      where: { gerenteId: userId },
      data: { gerenteId: null },
    });
    await tx.documentacao.updateMany({
      where: { autorId: userId },
      data: { autorId: fallbackUserId },
    });

    await tx.proposta.updateMany({
      where: { corretorId: userId },
      data: { corretorId: null },
    });
    await tx.proposta.updateMany({
      where: { autorId: userId },
      data: { autorId: fallbackUserId },
    });

    await tx.analise.updateMany({
      where: { analistaId: userId },
      data: { analistaId: null },
    });
    await tx.analise.updateMany({
      where: { autorId: userId },
      data: { autorId: fallbackUserId },
    });

    await tx.agendamento.updateMany({
      where: { atribuidoParaId: userId },
      data: { atribuidoParaId: null },
    });
    await tx.agendamento.updateMany({
      where: { alvoGerenteId: userId },
      data: { alvoGerenteId: null },
    });
    await tx.agendamento.updateMany({
      where: { aprovadoPorId: userId },
      data: { aprovadoPorId: null },
    });
    await tx.agendamento.updateMany({
      where: { autorId: userId },
      data: { autorId: fallbackUserId },
    });

    await tx.triagemEvent.updateMany({
      where: { autorId: userId },
      data: { autorId: fallbackUserId },
    });
    await tx.leadPrazoAdiamento.updateMany({
      where: { autorId: userId },
      data: { autorId: fallbackUserId },
    });

    await tx.meta.updateMany({
      where: { criadorId: userId },
      data: { criadorId: fallbackUserId },
    });
    await tx.meta.updateMany({
      where: { corretorId: userId },
      data: { corretorId: null },
    });
    await tx.meta.updateMany({
      where: { gerenteId: userId },
      data: { gerenteId: null },
    });

    await tx.financeiroComissao.updateMany({
      where: { gerenteId: userId },
      data: { gerenteId: null },
    });

    await tx.user.update({
      where: { id: userId },
      data: { equipeId: null },
    });
  }

  private async ensureExists(id: string, tenantId: string): Promise<void> {
    const count = await this.prisma.user.count({ where: { id, tenantId } });
    if (count === 0) {
      throw new NotFoundException('Usuário não encontrado.');
    }
  }

  private async ensureEmailIsAvailable(
    tenantId: string,
    email: string,
    ignoreId?: string,
  ): Promise<void> {
    const existing = await this.prisma.user.findFirst({
      where: { tenantId, email },
    });
    if (existing && existing.id !== ignoreId) {
      throw new ConflictException('Já existe um usuário com este e-mail.');
    }
  }

  /** Senha temporária aleatória que atende à política (maiúscula, minúscula e número). */
  private generatePassword(): string {
    const lower = 'abcdefghijkmnopqrstuvwxyz';
    const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const digits = '23456789';
    const all = lower + upper + digits;

    const pick = (set: string) => set[randomInt(set.length)];
    const chars = [pick(lower), pick(upper), pick(digits)];
    for (let i = chars.length; i < 14; i++) {
      chars.push(pick(all));
    }

    for (let i = chars.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }

    return chars.join('');
  }
}
