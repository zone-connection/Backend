import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ContatoTipo,
  CreciProcessoStatus,
  FunilTipo,
  MetaEscopo,
  MetaOrigem,
  MetaPeriodo,
  MetaTipo,
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
import { AccountMailService } from '../mailer/account-mail.service';
import {
  isDeliverableEmail,
  parseOptionalNotifyEmail,
} from '../mailer/mailer.service';
import { SALT_ROUNDS } from '../config/security.constants';
import { CreateUserDto } from './dto/create-user.dto';
import { ImportUsersDto } from './dto/import-users.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { QueryUsersDto } from './dto/query-users.dto';
import {
  assertRoleAllowedForPlano,
  PLANO_MAX_USUARIOS,
  tenantTemTarefas,
} from '../tenants/tenant-plan';
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
    private readonly accountMail: AccountMailService,
  ) {}

  async create(
    dto: CreateUserDto,
    requester: AuthenticatedUser,
  ): Promise<PublicUser> {
    if (requester.role === Role.super_admin) {
      return this.createPlatformSuperAdmin(dto);
    }

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

    const user = await this.prisma.user.create({
      data: {
        tenantId,
        name: dto.name.trim(),
        email,
        notifyEmail: this.requireNotifyEmail(dto.notifyEmail) ?? null,
        password: await bcrypt.hash(dto.password, SALT_ROUNDS),
        phone: dto.phone,
        whatsapp: dto.whatsapp,
        dataNascimento: parseDataNascimento(dto.dataNascimento) ?? null,
        cargo: dto.cargo,
        creci,
        cpf: dto.cpf?.trim() || null,
        rg: dto.rg?.trim() || null,
        endereco: dto.endereco?.trim() || null,
        cep: dto.cep?.trim() || null,
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
    if (user.status === UserStatus.ativo) {
      void this.accountMail.sendNewUser({
        name: user.name,
        email: user.email,
        notifyEmail: user.notifyEmail,
        role: user.role,
        password: dto.password,
      });
    }
    return user;
  }

  async importMany(dto: ImportUsersDto, requester: AuthenticatedUser) {
    const created: Array<{
      id: string;
      name: string;
      email: string;
      role: Role;
    }> = [];
    const errors: Array<{ index: number; nome: string; message: string }> = [];
    const seen = new Set<string>();

    for (let index = 0; index < dto.users.length; index += 1) {
      const item = dto.users[index]!;
      const email = item.email.toLowerCase().trim();
      if (seen.has(email)) {
        errors.push({
          index,
          nome: item.name,
          message: 'E-mail repetido nesta importação.',
        });
        continue;
      }
      seen.add(email);
      try {
        const user = await this.create(
          {
            name: item.name,
            email,
            password: item.password,
            creci: item.creci?.trim() || undefined,
            role: item.role,
          } as CreateUserDto,
          requester,
        );
        created.push({
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        });
      } catch (err) {
        errors.push({
          index,
          nome: item.name,
          message: this.importErrorMessage(err),
        });
      }
    }

    return {
      created: created.length,
      failed: errors.length,
      users: created,
      errors,
    };
  }

  private importErrorMessage(err: unknown): string {
    if (err instanceof HttpException) {
      const body = err.getResponse();
      if (typeof body === 'string') return body;
      if (body && typeof body === 'object' && 'message' in body) {
        const message = (body as { message?: string | string[] }).message;
        if (Array.isArray(message)) return message[0] ?? err.message;
        if (typeof message === 'string') return message;
      }
    }
    return err instanceof Error
      ? err.message
      : 'Não foi possível criar o usuário.';
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
        tarefasEnabled: true,
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
      tarefasEnabled: tenantTemTarefas(tenant),
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

  private async createPlatformSuperAdmin(
    dto: CreateUserDto,
  ): Promise<PublicUser> {
    if (dto.role !== Role.super_admin) {
      throw new ForbiddenException(
        'Na plataforma só é possível cadastrar outros super admins.',
      );
    }
    const email = dto.email.toLowerCase().trim();
    await this.ensureEmailIsAvailable(null, email);
    return this.prisma.user.create({
      data: {
        tenantId: null,
        name: dto.name.trim(),
        email,
        notifyEmail: this.requireNotifyEmail(dto.notifyEmail) ?? null,
        password: await bcrypt.hash(dto.password, SALT_ROUNDS),
        phone: dto.phone,
        whatsapp: dto.whatsapp,
        dataNascimento: parseDataNascimento(dto.dataNascimento) ?? null,
        cargo: dto.cargo,
        role: Role.super_admin,
        status: dto.status ?? UserStatus.ativo,
      },
      select: publicUserSelect,
    });
  }

  private assertCanCreateRole(requester: AuthenticatedUser, role: Role) {
    if (requester.role === Role.admin) return;

    if (
      (requester.role === Role.gerente ||
        requester.role === Role.analista ||
        requester.role === Role.rh) &&
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

  private requireNotifyEmail(
    value: string | null | undefined,
  ): string | null | undefined {
    const parsed = parseOptionalNotifyEmail(value);
    if (parsed && !isDeliverableEmail(parsed)) {
      throw new BadRequestException('Informe um e-mail de avisos válido.');
    }
    return parsed;
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
    if (requester.role === Role.super_admin) {
      const platformUser = await this.prisma.user.findFirst({
        where: { id, tenantId: null, role: Role.super_admin },
        select: publicUserSelect,
      });
      if (!platformUser) {
        throw new NotFoundException('Usuário não encontrado.');
      }
      return platformUser;
    }

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
    if (requester.role === Role.super_admin) {
      await this.ensurePlatformSuperAdmin(id);
      const email = dto.email?.toLowerCase().trim();
      if (email) {
        await this.ensureEmailIsAvailable(null, email, id);
      }
      if (dto.role !== undefined && dto.role !== Role.super_admin) {
        throw new ForbiddenException(
          'Um super admin da plataforma não pode ter outro perfil.',
        );
      }
      return this.prisma.user.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(email ? { email } : {}),
          ...(dto.notifyEmail !== undefined
            ? { notifyEmail: this.requireNotifyEmail(dto.notifyEmail) ?? null }
            : {}),
          ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
          ...(dto.whatsapp !== undefined ? { whatsapp: dto.whatsapp } : {}),
          ...(dto.cargo !== undefined ? { cargo: dto.cargo } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
        },
        select: publicUserSelect,
      });
    }

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
        ...(dto.notifyEmail !== undefined
          ? { notifyEmail: this.requireNotifyEmail(dto.notifyEmail) ?? null }
          : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.whatsapp !== undefined ? { whatsapp: dto.whatsapp } : {}),
        ...(dataNascimento !== undefined ? { dataNascimento } : {}),
        ...(dto.cargo !== undefined ? { cargo: dto.cargo } : {}),
        ...(creci !== undefined ? { creci } : {}),
        ...(dto.cpf !== undefined
          ? { cpf: dto.cpf === null ? null : dto.cpf.trim() || null }
          : {}),
        ...(dto.rg !== undefined
          ? { rg: dto.rg === null ? null : dto.rg.trim() || null }
          : {}),
        ...(dto.endereco !== undefined
          ? {
              endereco:
                dto.endereco === null ? null : dto.endereco.trim() || null,
            }
          : {}),
        ...(dto.cep !== undefined
          ? { cep: dto.cep === null ? null : dto.cep.trim() || null }
          : {}),
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
    if (requester.role === Role.super_admin) {
      if (id === requester.id) {
        throw new ForbiddenException('Você não pode excluir a própria conta.');
      }
      await this.ensurePlatformSuperAdmin(id);
      const otherAdmins = await this.prisma.user.count({
        where: {
          tenantId: null,
          role: Role.super_admin,
          id: { not: id },
          status: UserStatus.ativo,
        },
      });
      if (otherAdmins === 0) {
        throw new BadRequestException(
          'Não é possível excluir o último super admin da plataforma.',
        );
      }
      await this.prisma.user.delete({ where: { id } });
      return;
    }

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
    if (requester.role === Role.super_admin) {
      if (id === requester.id && status === UserStatus.inativo) {
        throw new ForbiddenException('Você não pode inativar a própria conta.');
      }
      await this.ensurePlatformSuperAdmin(id);
      if (status === UserStatus.inativo) {
        const otherAdmins = await this.prisma.user.count({
          where: {
            tenantId: null,
            role: Role.super_admin,
            id: { not: id },
            status: UserStatus.ativo,
          },
        });
        if (otherAdmins === 0) {
          throw new BadRequestException(
            'Não é possível inativar o último super admin da plataforma.',
          );
        }
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
    if (requester.role === Role.super_admin) {
      await this.ensurePlatformSuperAdmin(id);
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
      void this.accountMail.sendAdminPasswordReset({
        name: user.name,
        email: user.email,
        notifyEmail: user.notifyEmail,
        password: finalPassword,
      });
      return { user, temporaryPassword };
    }

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

    void this.accountMail.sendAdminPasswordReset({
      name: user.name,
      email: user.email,
      notifyEmail: user.notifyEmail,
      password: finalPassword,
    });

    return { user, temporaryPassword };
  }

  /** Gerente: só membros da própria equipe (+ ele mesmo). Admin: todos do tenant. */
  private async teamUserFilter(
    requester: AuthenticatedUser,
  ): Promise<Prisma.UserWhereInput> {
    if (requester.role === Role.super_admin) {
      return { tenantId: null, role: Role.super_admin };
    }

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

  private async ensurePlatformSuperAdmin(id: string): Promise<void> {
    const count = await this.prisma.user.count({
      where: { id, tenantId: null, role: Role.super_admin },
    });
    if (count === 0) {
      throw new NotFoundException('Usuário não encontrado.');
    }
  }

  private async ensureExists(id: string, tenantId: string): Promise<void> {
    const count = await this.prisma.user.count({ where: { id, tenantId } });
    if (count === 0) {
      throw new NotFoundException('Usuário não encontrado.');
    }
  }

  private async ensureEmailIsAvailable(
    tenantId: string | null,
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

  async popularDemonstracao(id: string, requester: AuthenticatedUser) {
    if (requester.role !== Role.admin && requester.role !== Role.super_admin) {
      throw new ForbiddenException('Só o administrador popula a carteira de demonstração.');
    }
    const tenantId = requireTenantId(requester);
    const corretor = await this.prisma.user.findFirst({
      where: { id, tenantId, role: Role.corretor, status: UserStatus.ativo },
      select: { id: true, name: true, equipe: { select: { gerenteId: true } } },
    });
    if (!corretor) {
      throw new NotFoundException('Corretor ativo não encontrado.');
    }
    const anteriores = await this.prisma.lead.findMany({
      where: { tenantId, corretorId: corretor.id, tags: { has: 'Demonstração' } },
      select: { id: true },
    });
    if (anteriores.length > 0) {
      await this.prisma.agendamento.deleteMany({
        where: { tenantId, leadId: { in: anteriores.map((item) => item.id) } },
      });
      await this.prisma.lead.deleteMany({
        where: { id: { in: anteriores.map((item) => item.id) } },
      });
    }
    await this.prisma.documentacao.deleteMany({
      where: {
        tenantId,
        corretorId: corretor.id,
        obs: 'Demonstração do corretor selecionado.',
      },
    });
    await this.prisma.meta.deleteMany({
      where: {
        tenantId,
        corretorId: corretor.id,
        titulo: { in: ['VGV do corretor', 'Vendas do corretor', 'Leads do corretor'] },
      },
    });

    const funil = await this.prisma.funil.findFirst({
      where: { tenantId, tipo: FunilTipo.comercial, ativo: true },
      include: {
        etapas: { where: { active: true }, orderBy: { sortOrder: 'asc' } },
      },
    });
    const etapas = funil?.etapas ?? [];
    const nomes = [
      'Ana Beatriz Costa', 'Carlos Mendes', 'Lúcia Ferreira', 'Pedro Almeida',
      'Sofia Nunes', 'Rafael Lima', 'Camila Borges', 'Henrique Dias',
      'Marina Prado', 'João Pacheco', 'Fernanda Alves', 'Paulo Nunes',
      'Laura Vasconcelos', 'Eduardo Melo', 'Beatriz Rocha', 'Thiago Andrade',
      'Juliana Freitas', 'Bruno Carvalho', 'Patricia Gomes', 'Diego Martins',
      'Aline Souza', 'Felipe Barros', 'Renata Duarte', 'Gustavo Pinto',
      'Helena Castro', 'Marcelo Tavares', 'Icaro Bezerra', 'Natalia Gomes',
      'Vinicius Araújo', 'Larissa Moura', 'André Farias', 'Bianca Lopes',
      'Caio Ribeiro', 'Daniela Cruz', 'Emanuel Silva', 'Flavia Teixeira',
      'Gabriel Nogueira', 'Isabela Campos', 'Jonas Pereira', 'Karina Lopes',
    ];
    const bairros = ['Boa Viagem', 'Casa Forte', 'Pina', 'Espinheiro', 'Graças', 'Madalena', 'Derby', 'Aflitos'];
    const origens = ['WhatsApp', 'Instagram', 'Indicação', 'Site', 'Facebook', 'Portal'];
    const prioridades = ['Alta', 'Média', 'Baixa'];
    const prefixo = corretor.id.slice(0, 8);
    let leads = 0;
    if (funil && etapas.length > 0) {
      await this.prisma.lead.createMany({
        data: nomes.map((nome, index) => {
          const cliente = index >= 28;
          const etapa = etapas[index % etapas.length];
          return {
            tenantId,
            tipo: cliente ? ContatoTipo.cliente : ContatoTipo.lead,
            nome,
            telefone: `(81) 98823-${String(2000 + index).padStart(4, '0')}`,
            email: `demo.${index}.${prefixo}@exemplo.local`,
            origem: origens[index % origens.length],
            interesse: 'Comprar',
            cidade: 'Recife',
            bairro: bairros[index % bairros.length],
            stage: etapa.slug,
            funilId: funil.id,
            prioridade: prioridades[index % prioridades.length],
            renda: 4500 + (index % 8) * 1500,
            tags: ['Demonstração'],
            corretorId: corretor.id,
          };
        }),
      });
      leads = nomes.length;
    }

    const empreendimentos = [
      'Residencial Boa Viagem', 'Edifício Casa Forte', 'Sphera Recife',
      'Reserva Pina', 'Alto Espinheiro', 'Vila das Graças', 'Jardim Derby',
      'Parque Madalena', 'Torre Aflitos', 'Marina Olinda', 'Solar Piedade',
      'Bosque Jaqueira', 'Vista Rio Capibaribe', 'Plaza Derby', 'Maré Boa Viagem',
    ];
    const agora = new Date();
    await this.prisma.documentacao.createMany({
      data: empreendimentos.map((nome, index) => {
        const vendido = index < 10;
        const mesesAtras = index % 4;
        const dataVenda = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() - mesesAtras, 4 + (index % 20), 15));
        return {
          tenantId,
          autorId: requester.id,
          tipoContato: ContatoTipo.cliente,
          stageSituacao: '',
          nome,
          fonte: 'Outro',
          origem: index % 5 === 0 ? 'usado' : 'lancamento',
          status1: vendido ? 'Aprovado' : 'Análise',
          status2: vendido ? 'Vendido' : 'Andamento',
          corretorId: corretor.id,
          gerenteId: corretor.equipe?.gerenteId ?? null,
          dataVenda: vendido ? dataVenda : null,
          vgv: 180000 + index * 47000,
          vendaSemProposta: true,
          obs: 'Demonstração do corretor selecionado.',
        };
      }),
    });

    const criados = funil
      ? await this.prisma.lead.findMany({
          where: { tenantId, corretorId: corretor.id, tags: { has: 'Demonstração' } },
          select: { id: true, nome: true },
          take: 12,
        })
      : [];
    const tiposAgenda = ['visita', 'ligacao', 'reuniao', 'tarefa'] as const;
    if (criados.length > 0) {
      await this.prisma.agendamento.createMany({
        data: criados.map((lead, index) => {
          const inicioComp = new Date(agora.getTime() + (index - 4) * 36 * 60 * 60 * 1000);
          inicioComp.setUTCHours(13 + (index % 5), 0, 0, 0);
          return {
            tenantId,
            leadId: lead.id,
            autorId: corretor.id,
            titulo: `${tiposAgenda[index % tiposAgenda.length] === 'visita' ? 'Visita' : tiposAgenda[index % tiposAgenda.length] === 'ligacao' ? 'Ligação' : tiposAgenda[index % tiposAgenda.length] === 'reuniao' ? 'Reunião' : 'Tarefa'} · ${lead.nome}`,
            tipo: tiposAgenda[index % tiposAgenda.length],
            status: index < 3 ? 'concluido' as const : 'agendado' as const,
            startsAt: inicioComp,
            endsAt: new Date(inicioComp.getTime() + 60 * 60 * 1000),
            observacoes: 'Demonstração do corretor selecionado.',
          };
        }),
      });
    }

    const inicio = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1));
    const fim = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() + 1, 1));
    await this.prisma.meta.createMany({
      data: [
        {
          tenantId,
          escopo: MetaEscopo.corretor,
          corretorId: corretor.id,
          criadorId: requester.id,
          origem: MetaOrigem.admin,
          tipo: MetaTipo.vgv,
          periodo: MetaPeriodo.mensal,
          titulo: 'VGV do corretor',
          valor: 1500000,
          inicio,
          fim,
        },
        {
          tenantId,
          escopo: MetaEscopo.corretor,
          corretorId: corretor.id,
          criadorId: requester.id,
          origem: MetaOrigem.admin,
          tipo: MetaTipo.vendas,
          periodo: MetaPeriodo.mensal,
          titulo: 'Vendas do corretor',
          valor: 6,
          inicio,
          fim,
        },
        {
          tenantId,
          escopo: MetaEscopo.corretor,
          corretorId: corretor.id,
          criadorId: requester.id,
          origem: MetaOrigem.admin,
          tipo: MetaTipo.leads,
          periodo: MetaPeriodo.mensal,
          titulo: 'Leads do corretor',
          valor: 30,
          inicio,
          fim,
        },
      ],
    });

    return {
      ok: true,
      corretor: corretor.name,
      leads,
      vendas: empreendimentos.filter((_, index) => index < 10).length,
    };
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
