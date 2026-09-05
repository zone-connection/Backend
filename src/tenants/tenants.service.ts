import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CatalogType, FunilTipo, Prisma, Role, TenantPlano, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { CreateTenantAdminDto } from './dto/create-tenant-admin.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { UpdateTenantCompanyDto } from './dto/update-tenant-company.dto';
import { CreateMetaConnectionDto } from './dto/create-meta-connection.dto';
import { UpdateMetaConnectionDto } from './dto/update-meta-connection.dto';
import { CreateOzapConnectionDto } from './dto/create-ozap-connection.dto';
import { UpdateOzapConnectionDto } from './dto/update-ozap-connection.dto';
import {
  tenantAdminSelect,
  tenantBrandingSelect,
} from '../common/utils/tenant-branding';
import { publicUserSelect } from '../common/utils/user-select';
import { SALT_ROUNDS } from '../config/security.constants';
import {
  DEFAULT_FUNIL_NAME,
  DEFAULT_FUNNEL_STAGES,
  funilEtapasCreateData,
} from '../catalog/catalog.defaults';
import {
  PLANO_MAX_USUARIOS,
  applyPlanoModules,
  resolvePlanoFields,
} from './tenant-plan';
import {
  mergeOperationModules,
  pickOperationModules,
} from './tenant-operation.util';
import { UpdateTenantOperationModulesDto } from './dto/update-tenant-operation-modules.dto';
import { CreateTenantUserDto } from './dto/create-tenant-user.dto';
import {
  PLATFORM_TENANT_ID,
  requireTenantId,
} from '../common/utils/tenant';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import { TenantLogoColorService } from './tenant-logo-color.service';
import { TenantDemoDataService } from './tenant-demo-data.service';
import { MediaService } from '../media/media.service';
import { encryptSecret, metaTokenKey } from '../meta/meta-token.crypto';
import { PopulateDemoDataDto } from './dto/populate-demo-data.dto';
import { UpdateTenantAdminDto } from './dto/update-tenant-admin.dto';

const tenantSelect = tenantAdminSelect;

/** Admin “principal” do tenant (mais antigo com role admin). */
const tenantAdminUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  status: true,
} satisfies Prisma.UserSelect;

const adminUsersInclude = {
  where: { role: Role.admin },
  orderBy: { createdAt: 'asc' as const },
  take: 1,
  select: tenantAdminUserSelect,
};

const metaConnectionSelect = {
  id: true,
  tenantId: true,
  pageId: true,
  pageAccessToken: true,
  pageName: true,
  adAccountId: true,
  adAccountName: true,
  ativo: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.TenantMetaConnectionSelect;

const ozapConnectionSelect = {
  id: true,
  tenantId: true,
  instanceId: true,
  ativo: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.TenantOzapConnectionSelect;

type MetaConnection = Prisma.TenantMetaConnectionGetPayload<{
  select: typeof metaConnectionSelect;
}>;

/** Mascara um segredo mostrando apenas os 4 últimos caracteres (ex.: token de acesso). */
function maskSecret(value: string): string {
  if (value.length <= 4) {
    return '•'.repeat(value.length);
  }
  return `${'•'.repeat(Math.min(8, value.length - 4))}${value.slice(-4)}`;
}

function maskMetaConnection(connection: MetaConnection) {
  return { ...connection, pageAccessToken: maskSecret(connection.pageAccessToken) };
}

@Injectable()
export class TenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantLogoColor: TenantLogoColorService,
    private readonly demoDataService: TenantDemoDataService,
    private readonly config: ConfigService,
    private readonly media: MediaService,
  ) {}

  /**
   * Gera dados fictícios (usuários, leads, imóveis, agenda, financeiro…)
   * no tenant informado. Uso exclusivo de demonstração/treinamento.
   */
  async populateDemoData(id: string, dto: PopulateDemoDataDto = {}) {
    const result = await this.demoDataService.populate(id, dto);
    await this.prisma.tenant.update({
      where: { id },
      data: { isTest: true },
    });
    const tenant = await this.findOne(id);
    return { ...result, tenant };
  }

  findAll() {
    return this.prisma.tenant
      .findMany({
        where: { id: { not: PLATFORM_TENANT_ID } },
        select: {
          ...tenantSelect,
          users: adminUsersInclude,
          metaConnections: {
            where: { ativo: true },
            select: { id: true },
            take: 1,
          },
          ozapConnections: {
            where: { ativo: true },
            select: { id: true },
            take: 1,
          },
          oruloConnections: {
            where: { ativo: true },
            select: { id: true },
            take: 1,
          },
        },
        orderBy: { name: 'asc' },
      })
      .then((rows) =>
        rows.map(
          ({
            users,
            metaConnections,
            ozapConnections,
            oruloConnections,
            ...tenant
          }) => ({
            ...tenant,
            admin: users[0] ?? null,
            hasMetaConnection: metaConnections.length > 0,
            hasOzapConnection: ozapConnections.length > 0,
            hasOruloConnection: oruloConnections.length > 0,
          }),
        ),
      );
  }

  async create(dto: CreateTenantDto) {
    const slug = dto.slug.toLowerCase().trim();
    await this.ensureSlugAvailable(slug);

    const tenantName = dto.name.trim();
    const adminName = `Admin ${tenantName}`;
    const adminEmail = this.buildAdminEmail(slug);
    const temporaryPassword = this.generateTemporaryPassword();
    const passwordHash = await bcrypt.hash(temporaryPassword, SALT_ROUNDS);
    const planFields = resolvePlanoFields({
      plano: dto.plano ?? TenantPlano.bronze,
      maxUsuarios: dto.maxUsuarios,
      usuariosExtras: dto.usuariosExtras,
      iaBotEnabled: dto.iaBotEnabled,
      modules: dto.modules,
    });
    const extras = this.sanitizeTenantExtras({
      logoUrl: dto.logoUrl,
      modules: planFields.modules,
    });
    const primaryColor = await this.tenantLogoColor.extractPrimaryColor(
      extras.logoUrl ?? null,
    );

    try {
      return await this.prisma.$transaction(async (tx) => {
        const tenant = await tx.tenant.create({
          data: {
            name: tenantName,
            slug,
            documento: this.normalizeDocumento(dto.documento),
            status: dto.status ?? UserStatus.ativo,
            primaryColor,
            sidebarStyle: 'default',
            density: 'comfortable',
            homePath: '/dashboard',
            plano: planFields.plano,
            maxUsuarios: planFields.maxUsuarios,
            usuariosExtras: planFields.usuariosExtras,
            iaBotEnabled: planFields.iaBotEnabled,
            isTest: dto.isTest ?? false,
            ...extras,
          },
          select: tenantSelect,
        });

        const admin = await tx.user.create({
          data: {
            tenantId: tenant.id,
            name: adminName,
            email: adminEmail,
            password: passwordHash,
            role: Role.admin,
            status: UserStatus.ativo,
            cargo: 'Administrador',
          },
          select: publicUserSelect,
        });

        await this.seedDefaultFunnelStages(tx, tenant.id);

        return { ...tenant, admin, temporaryPassword };
      });
    } catch (error) {
      throw this.translateUniqueConstraint(
        error,
        'Já existe um tenant com este slug ou o e-mail do admin já está em uso neste tenant.',
      );
    }
  }

  /**
   * Cria o primeiro admin de um tenant que ainda não tem usuários.
   * Sem body (ou campos omitidos): gera e-mail e senha automaticamente.
   */
  async createInitialAdmin(tenantId: string, dto: CreateTenantAdminDto = {}) {
    await this.ensureExists(tenantId);

    const userCount = await this.prisma.user.count({ where: { tenantId } });
    if (userCount > 0) {
      throw new ConflictException(
        'Este tenant já possui usuários. Entre como admin do tenant para gerenciar a equipe.',
      );
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, slug: true },
    });
    if (!tenant) {
      throw new NotFoundException('Tenant não encontrado.');
    }

    const name = dto.name?.trim() || `Admin ${tenant.name}`;
    const email = (
      dto.email?.trim().toLowerCase() || this.buildAdminEmail(tenant.slug)
    );
    const temporaryPassword =
      dto.password?.trim() || this.generateTemporaryPassword();
    const passwordHash = await bcrypt.hash(temporaryPassword, SALT_ROUNDS);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const admin = await tx.user.create({
          data: {
            tenantId,
            name,
            email,
            password: passwordHash,
            role: Role.admin,
            status: UserStatus.ativo,
            cargo: 'Administrador',
          },
          select: publicUserSelect,
        });

        const catalogCount = await tx.catalogItem.count({
          where: { tenantId, type: CatalogType.funil_etapa },
        });
        if (catalogCount === 0) {
          await this.seedDefaultFunnelStages(tx, tenantId);
        }

        return { user: admin, temporaryPassword };
      });
    } catch (error) {
      throw this.translateUniqueConstraint(
        error,
        'Este e-mail já está em uso neste tenant.',
      );
    }
  }

  async findOne(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      select: {
        ...tenantSelect,
        users: adminUsersInclude,
        metaConnections: {
          select: metaConnectionSelect,
          orderBy: { createdAt: 'desc' },
        },
        ozapConnections: {
          select: ozapConnectionSelect,
          orderBy: { createdAt: 'desc' },
        },
        oruloConnections: {
          select: {
            id: true,
            tenantId: true,
            clientId: true,
            ativo: true,
            lastFullSyncAt: true,
            lastReconcileAt: true,
            lastError: true,
            syncing: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        _count: { select: { users: true } },
      },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant não encontrado.');
    }

    const {
      _count,
      metaConnections,
      ozapConnections,
      oruloConnections,
      users,
      ...rest
    } = tenant;
    return {
      ...rest,
      admin: users[0] ?? null,
      userCount: _count.users,
      metaConnections: metaConnections.map(maskMetaConnection),
      ozapConnections,
      oruloConnections: oruloConnections.map((row) => ({
        ...row,
        clientId:
          row.clientId.length <= 6
            ? '••••'
            : `${row.clientId.slice(0, 4)}…${row.clientId.slice(-4)}`,
      })),
    };
  }

  /**
   * Gera senha temporária para o admin principal do tenant (super_admin).
   * A senha só é legível nesta resposta.
   */
  async resetAdminPassword(tenantId: string) {
    await this.ensureExists(tenantId);

    const admin = await this.prisma.user.findFirst({
      where: { tenantId, role: Role.admin },
      orderBy: { createdAt: 'asc' },
      select: tenantAdminUserSelect,
    });

    if (!admin) {
      throw new NotFoundException(
        'Este tenant ainda não tem administrador. Crie o admin inicial primeiro.',
      );
    }

    const temporaryPassword = this.generateTemporaryPassword();
    const hashed = await bcrypt.hash(temporaryPassword, SALT_ROUNDS);
    const updated = await this.prisma.user.updateMany({
      where: { id: admin.id, tenantId },
      data: {
        password: hashed,
        hashedRefreshToken: null,
        passwordResetToken: null,
        passwordResetExpires: null,
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });
    if (updated.count === 0) {
      throw new NotFoundException('Administrador não encontrado neste tenant.');
    }

    const user = await this.prisma.user.findFirstOrThrow({
      where: { id: admin.id, tenantId },
      select: publicUserSelect,
    });

    return { user, temporaryPassword };
  }

  /**
   * Atualiza nome/e-mail do admin principal deste tenant.
   * O where inclui tenantId para não tocar no admin de outro cliente
   * mesmo se o e-mail for igual (ex.: tenant duplicado).
   */
  async updateAdmin(tenantId: string, dto: UpdateTenantAdminDto) {
    if (tenantId === PLATFORM_TENANT_ID) {
      throw new BadRequestException(
        'O tenant interno da plataforma não pode ser alterado por aqui.',
      );
    }
    await this.ensureExists(tenantId);

    const admin = await this.prisma.user.findFirst({
      where: { tenantId, role: Role.admin },
      orderBy: { createdAt: 'asc' },
      select: { id: true, tenantId: true, email: true },
    });

    if (!admin || admin.tenantId !== tenantId) {
      throw new NotFoundException(
        'Este tenant ainda não tem administrador. Crie o admin inicial primeiro.',
      );
    }

    const name = dto.name?.trim();
    const email = dto.email?.trim().toLowerCase();
    if (!name && !email) {
      throw new BadRequestException('Informe nome ou e-mail para atualizar.');
    }

    if (email && email !== admin.email) {
      const clash = await this.prisma.user.findFirst({
        where: { tenantId, email, id: { not: admin.id } },
        select: { id: true },
      });
      if (clash) {
        throw new ConflictException(
          'Já existe um usuário com este e-mail neste tenant.',
        );
      }
    }

    const emailChanged = Boolean(email && email !== admin.email);

    try {
      const updated = await this.prisma.user.updateMany({
        where: { id: admin.id, tenantId },
        data: {
          ...(name ? { name } : {}),
          ...(email ? { email } : {}),
          ...(emailChanged
            ? {
                hashedRefreshToken: null,
                passwordResetToken: null,
                passwordResetExpires: null,
              }
            : {}),
        },
      });
      if (updated.count === 0) {
        throw new NotFoundException('Administrador não encontrado neste tenant.');
      }
    } catch (error) {
      throw this.translateUniqueConstraint(
        error,
        'Este e-mail já está em uso neste tenant.',
      );
    }

    return this.prisma.user.findFirstOrThrow({
      where: { id: admin.id, tenantId },
      select: publicUserSelect,
    });
  }

  /**
   * Remove o tenant e todos os dados vinculados (cascade).
   * Equipes são apagadas antes por causa do FK Restrict em gerenteId → User.
   */
  async remove(id: string) {
    if (id === PLATFORM_TENANT_ID) {
      throw new BadRequestException(
        'O tenant interno da plataforma não pode ser removido.',
      );
    }
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      select: { id: true, name: true, slug: true },
    });
    if (!tenant) {
      throw new NotFoundException('Tenant não encontrado.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.equipe.deleteMany({ where: { tenantId: id } });
      await tx.tenant.delete({ where: { id } });
    });

    return { id: tenant.id, name: tenant.name, slug: tenant.slug };
  }

  /**
   * Super admin cria usuário no tenant. Se a cota estiver cheia,
   * incrementa `usuariosExtras` automaticamente.
   */
  async createUserForTenant(tenantId: string, dto: CreateTenantUserDto) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        maxUsuarios: true,
        usuariosExtras: true,
      },
    });
    if (!tenant) throw new NotFoundException('Tenant não encontrado.');

    const email = dto.email.toLowerCase().trim();
    const existing = await this.prisma.user.findFirst({
      where: { tenantId, email },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(
        'Já existe um usuário com este e-mail neste tenant.',
      );
    }

    const temporaryPassword =
      dto.password?.trim() || this.generateTemporaryPassword();
    const passwordHash = await bcrypt.hash(temporaryPassword, SALT_ROUNDS);

    const userCount = await this.prisma.user.count({ where: { tenantId } });
    const limit = tenant.maxUsuarios + tenant.usuariosExtras;
    const needExtra = userCount >= limit;

    const user = await this.prisma.$transaction(async (tx) => {
      if (needExtra) {
        await tx.tenant.update({
          where: { id: tenantId },
          data: { usuariosExtras: { increment: 1 } },
        });
      }
      return tx.user.create({
        data: {
          tenantId,
          name: dto.name.trim(),
          email,
          password: passwordHash,
          phone: dto.phone,
          whatsapp: dto.whatsapp,
          cargo: dto.cargo,
          role: dto.role,
          status: dto.status ?? UserStatus.ativo,
        },
        select: publicUserSelect,
      });
    });

    return {
      user,
      temporaryPassword: dto.password?.trim() ? undefined : temporaryPassword,
      usuariosExtrasIncremented: needExtra,
    };
  }

  async update(id: string, dto: UpdateTenantDto) {
    if (id === PLATFORM_TENANT_ID) {
      throw new BadRequestException(
        'O tenant interno da plataforma não pode ser alterado por aqui.',
      );
    }
    await this.ensureExists(id);

    const current = await this.prisma.tenant.findUnique({
      where: { id },
      select: {
        plano: true,
        maxUsuarios: true,
        usuariosExtras: true,
        iaBotEnabled: true,
        modules: true,
        logoUrl: true,
        logoPublicId: true,
      },
    });
    if (!current) throw new NotFoundException('Tenant não encontrado.');

    const plano = dto.plano ?? current.plano;
    const planChanged = dto.plano !== undefined && dto.plano !== current.plano;

    const planFields = resolvePlanoFields({
      plano,
      maxUsuarios:
        dto.maxUsuarios ?? (planChanged ? undefined : current.maxUsuarios),
      usuariosExtras: dto.usuariosExtras ?? current.usuariosExtras,
      iaBotEnabled:
        dto.iaBotEnabled ??
        (planChanged ? undefined : current.iaBotEnabled),
      modules:
        dto.modules ??
        (planChanged
          ? undefined
          : (current.modules as Record<string, boolean> | null)),
    });

    const modulesToSave =
      dto.modules !== undefined
        ? planFields.modules
        : planChanged
          ? planFields.modules
          : undefined;

    const extras = this.sanitizeTenantExtras({
      logoUrl: dto.logoUrl,
      modules: modulesToSave,
    });
    const logoChanged =
      dto.logoUrl !== undefined && extras.logoUrl !== current.logoUrl;
    const primaryColor = logoChanged
      ? await this.tenantLogoColor.extractPrimaryColor(extras.logoUrl ?? null)
      : undefined;
    if (logoChanged) {
      await this.media.destroy(current.logoPublicId);
    }

    try {
      return await this.prisma.tenant.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.documento !== undefined
            ? { documento: this.normalizeDocumento(dto.documento) }
            : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          plano: planFields.plano,
          maxUsuarios:
            dto.maxUsuarios ??
            (planChanged
              ? PLANO_MAX_USUARIOS[planFields.plano]
              : current.maxUsuarios),
          usuariosExtras: planFields.usuariosExtras,
          iaBotEnabled: planFields.iaBotEnabled,
          ...(dto.isTest !== undefined ? { isTest: dto.isTest } : {}),
          ...(logoChanged
            ? { primaryColor, logoPublicId: null }
            : {}),
          sidebarStyle: 'default',
          density: 'comfortable',
          homePath: '/dashboard',
          ...extras,
        },
        select: tenantSelect,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2022'
      ) {
        throw new BadRequestException(
          'Banco desatualizado: rode as migrations de branding do tenant (prisma migrate deploy).',
        );
      }
      throw error;
    }
  }

  // ---------------------------------------------------------------------
  // Conexões Meta (Lead Ads)
  // ---------------------------------------------------------------------

  async listMetaConnections(tenantId: string) {
    await this.ensureExists(tenantId);

    const connections = await this.prisma.tenantMetaConnection.findMany({
      where: { tenantId },
      select: metaConnectionSelect,
      orderBy: { createdAt: 'desc' },
    });

    return connections.map(maskMetaConnection);
  }

  async createMetaConnection(tenantId: string, dto: CreateMetaConnectionDto) {
    await this.ensureExists(tenantId);
    const pageId = dto.pageId.trim();
    const pageAccessToken = encryptSecret(
      dto.pageAccessToken.trim(),
      metaTokenKey(this.config),
    );
    await this.ensurePageIdAvailable(pageId);

    try {
      const connection = await this.prisma.tenantMetaConnection.create({
        data: {
          tenantId,
          pageId,
          pageAccessToken,
          ativo: dto.ativo ?? true,
        },
        select: metaConnectionSelect,
      });
      return maskMetaConnection(connection);
    } catch (error) {
      throw this.translateUniqueConstraint(
        error,
        'Já existe uma conexão Meta com este pageId.',
      );
    }
  }

  async updateMetaConnection(
    tenantId: string,
    connectionId: string,
    dto: UpdateMetaConnectionDto,
  ) {
    await this.ensureMetaConnectionExists(tenantId, connectionId);

    const connection = await this.prisma.tenantMetaConnection.update({
      where: { id: connectionId },
      data: {
        ...(dto.pageAccessToken !== undefined
          ? {
              pageAccessToken: encryptSecret(
                dto.pageAccessToken.trim(),
                metaTokenKey(this.config),
              ),
            }
          : {}),
        ...(dto.ativo !== undefined ? { ativo: dto.ativo } : {}),
      },
      select: metaConnectionSelect,
    });

    return maskMetaConnection(connection);
  }

  async removeMetaConnection(tenantId: string, connectionId: string) {
    await this.ensureMetaConnectionExists(tenantId, connectionId);
    await this.prisma.tenantMetaConnection.delete({
      where: { id: connectionId },
    });
    return { ok: true };
  }

  // ---------------------------------------------------------------------
  // Conexões OZap (WhatsApp)
  // ---------------------------------------------------------------------

  async listOzapConnections(tenantId: string) {
    await this.ensureExists(tenantId);

    return this.prisma.tenantOzapConnection.findMany({
      where: { tenantId },
      select: ozapConnectionSelect,
      orderBy: { createdAt: 'desc' },
    });
  }

  async createOzapConnection(tenantId: string, dto: CreateOzapConnectionDto) {
    await this.ensureExists(tenantId);
    await this.ensureInstanceIdAvailable(dto.instanceId);

    try {
      const connection = await this.prisma.tenantOzapConnection.create({
        data: {
          tenantId,
          instanceId: dto.instanceId,
          ativo: dto.ativo ?? true,
        },
        select: ozapConnectionSelect,
      });
      if (tenantId === PLATFORM_TENANT_ID) {
        await this.prisma.tenant.update({
          where: { id: tenantId },
          data: { iaBotEnabled: true },
        });
      }
      return connection;
    } catch (error) {
      throw this.translateUniqueConstraint(
        error,
        'Já existe uma conexão OZap com este instanceId.',
      );
    }
  }

  async updateOzapConnection(
    tenantId: string,
    connectionId: string,
    dto: UpdateOzapConnectionDto,
  ) {
    await this.ensureOzapConnectionExists(tenantId, connectionId);

    return this.prisma.tenantOzapConnection.update({
      where: { id: connectionId },
      data: {
        ...(dto.ativo !== undefined ? { ativo: dto.ativo } : {}),
      },
      select: ozapConnectionSelect,
    });
  }

  async removeOzapConnection(tenantId: string, connectionId: string) {
    await this.ensureOzapConnectionExists(tenantId, connectionId);
    await this.prisma.tenantOzapConnection.delete({
      where: { id: connectionId },
    });
    return { ok: true };
  }

  // ---------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------

  private async seedDefaultFunnelStages(
    tx: Prisma.TransactionClient,
    tenantId: string,
  ): Promise<void> {
    await tx.catalogItem.createMany({
      data: DEFAULT_FUNNEL_STAGES.map((stage) => ({
        tenantId,
        type: CatalogType.funil_etapa,
        label: stage.label,
        slug: stage.slug,
        color: stage.color,
        sortOrder: stage.sortOrder,
        active: true,
      })),
      skipDuplicates: true,
    });

    const existingFunil = await tx.funil.findFirst({
      where: { tenantId },
      select: { id: true },
    });
    if (!existingFunil) {
      await tx.funil.create({
        data: {
          tenantId,
          name: 'Funil padrão',
          tipo: FunilTipo.comercial,
          ativo: true,
          etapas: {
            create: DEFAULT_FUNNEL_STAGES.map((stage) => ({
              label: stage.label,
              slug: stage.slug,
              color: stage.color,
              sortOrder: stage.sortOrder,
              active: true,
            })),
          },
        },
      });
    }

    for (const tipo of [FunilTipo.captacao, FunilTipo.venda_usados] as const) {
      const exists = await tx.funil.findFirst({
        where: { tenantId, tipo },
        select: { id: true },
      });
      if (exists) continue;
      const baseName = DEFAULT_FUNIL_NAME[tipo];
      const clash = await tx.funil.findUnique({
        where: { tenantId_name: { tenantId, name: baseName } },
        select: { id: true },
      });
      await tx.funil.create({
        data: {
          tenantId,
          name: clash ? `${baseName} (padrão)` : baseName,
          tipo,
          ativo: true,
          etapas: { create: funilEtapasCreateData(tipo) },
        },
      });
    }
  }

  /** Normaliza logoUrl e modules (create/update). */
  private sanitizeTenantExtras(dto: {
    logoUrl?: string | null;
    modules?: Record<string, boolean> | null;
  }) {
    const data: {
      logoUrl?: string | null;
      modules?: Prisma.InputJsonValue | typeof Prisma.DbNull;
    } = {};

    if (dto.logoUrl !== undefined) {
      if (dto.logoUrl === null) {
        data.logoUrl = null;
      } else {
        const trimmed = dto.logoUrl.trim();
        if (trimmed && !/^https?:\/\/.+/i.test(trimmed)) {
          throw new BadRequestException(
            'logoUrl deve ser uma URL http(s) válida.',
          );
        }
        data.logoUrl = trimmed || null;
      }
    }

    if (dto.modules !== undefined) {
      data.modules =
        dto.modules === null
          ? Prisma.DbNull
          : (dto.modules as Prisma.InputJsonValue);
    }

    return data;
  }

  /** Senha temporária aleatória (maiúscula, minúscula e número). */
  private generateTemporaryPassword(): string {
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

  /** Dados da imobiliária do tenant do requester. */
  async getCompanyProfile(requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: tenantBrandingSelect,
    });
    if (!tenant) {
      throw new NotFoundException('Tenant não encontrado.');
    }
    return tenant;
  }

  /** Atualiza nome/documento/CRECI/contato da imobiliária (admin). */
  async updateCompanyProfile(
    requester: AuthenticatedUser,
    dto: UpdateTenantCompanyDto,
  ) {
    const tenantId = this.assertCanEditCompany(requester);
    await this.ensureExists(tenantId);

    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.documento !== undefined
          ? { documento: this.normalizeDocumento(dto.documento) }
          : {}),
        ...(dto.creci !== undefined ? { creci: dto.creci.trim() } : {}),
        ...(dto.email !== undefined
          ? { email: dto.email.trim().toLowerCase() }
          : {}),
        ...(dto.telefone !== undefined
          ? { telefone: dto.telefone.trim() }
          : {}),
        ...(dto.endereco !== undefined
          ? { endereco: dto.endereco.trim() }
          : {}),
        ...(dto.cidade !== undefined ? { cidade: dto.cidade.trim() } : {}),
      },
      select: tenantBrandingSelect,
    });
  }

  async uploadCompanyLogo(
    requester: AuthenticatedUser,
    rawFile: Express.Multer.File | undefined,
  ) {
    const tenantId = this.assertCanEditCompany(requester);
    const current = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { logoPublicId: true },
    });
    if (!current) throw new NotFoundException('Tenant não encontrado.');

    const file = this.media.requireFile(rawFile);
    const uploaded = await this.media.uploadImage({
      buffer: file.buffer,
      mimetype: file.mimetype,
      folder: this.media.folder(tenantId, 'tenants', tenantId),
      maxWidth: 1600,
      maxHeight: 1600,
    });
    const primaryColor = await this.tenantLogoColor.extractPrimaryColor(
      uploaded.url,
    );
    await this.media.destroy(current.logoPublicId);

    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        logoUrl: uploaded.url,
        logoPublicId: uploaded.publicId,
        primaryColor,
      },
      select: tenantBrandingSelect,
    });
  }

  async removeCompanyLogo(requester: AuthenticatedUser) {
    const tenantId = this.assertCanEditCompany(requester);
    const current = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { logoPublicId: true },
    });
    if (!current) throw new NotFoundException('Tenant não encontrado.');

    await this.media.destroy(current.logoPublicId);
    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: { logoUrl: null, logoPublicId: null, primaryColor: null },
      select: tenantBrandingSelect,
    });
  }

  private assertCanEditCompany(requester: AuthenticatedUser): string {
    if (requester.role !== Role.admin) {
      throw new ForbiddenException(
        'Somente o administrador pode editar os dados da imobiliária.',
      );
    }
    const tenantId = requireTenantId(requester);
    if (tenantId === PLATFORM_TENANT_ID) {
      throw new BadRequestException(
        'O tenant interno da plataforma não pode ser alterado por aqui.',
      );
    }
    return tenantId;
  }

  async getOperationModules(requester: AuthenticatedUser) {
    const tenantId = requireTenantId(requester);
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { plano: true, modules: true },
    });
    if (!tenant) throw new NotFoundException('Tenant não encontrado.');
    const modules = applyPlanoModules(tenant.plano, tenant.modules);
    return {
      modules,
      operations: pickOperationModules(modules),
      hideClientesNav: modules.hideClientesNav === true,
      adminVerClientesCorretor: modules.adminVerClientesCorretor === true,
    };
  }

  async updateOperationModules(
    requester: AuthenticatedUser,
    dto: UpdateTenantOperationModulesDto,
  ) {
    if (requester.role !== Role.admin) {
      throw new ForbiddenException(
        'Somente o administrador pode alterar as operações da imobiliária.',
      );
    }
    const tenantId = requireTenantId(requester);
    if (tenantId === PLATFORM_TENANT_ID) {
      throw new BadRequestException(
        'O tenant interno da plataforma não pode ser alterado por aqui.',
      );
    }
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { plano: true, modules: true },
    });
    if (!tenant) throw new NotFoundException('Tenant não encontrado.');

    const current = applyPlanoModules(tenant.plano, tenant.modules);
    const merged = mergeOperationModules(current, {
      captacao: dto.captacao,
      imoveisUsados: dto.imoveisUsados,
      locacao: dto.locacao,
    });
    if (typeof dto.hideClientesNav === 'boolean') {
      merged.hideClientesNav = dto.hideClientesNav;
    }
    if (typeof dto.adminVerClientesCorretor === 'boolean') {
      merged.adminVerClientesCorretor = dto.adminVerClientesCorretor;
    }
    const modules = applyPlanoModules(tenant.plano, merged);

    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { modules: modules as Prisma.InputJsonValue },
    });

    return {
      modules,
      operations: pickOperationModules(modules),
      hideClientesNav: modules.hideClientesNav === true,
      adminVerClientesCorretor: modules.adminVerClientesCorretor === true,
    };
  }

  /** Mantém só dígitos do CPF/CNPJ (até 14). */
  private normalizeDocumento(value?: string | null): string {
    return String(value ?? '')
      .replace(/\D/g, '')
      .slice(0, 14);
  }

  /** E-mail padrão do admin: admin@{slugSemHifen}.com */
  private buildAdminEmail(slug: string): string {
    const safe =
      slug.replace(/[^a-z0-9-]/g, '').replace(/-/g, '').slice(0, 60) ||
      'tenant';
    return `admin@${safe}.com`;
  }

  private async ensureExists(id: string): Promise<void> {
    const count = await this.prisma.tenant.count({ where: { id } });
    if (count === 0) {
      throw new NotFoundException('Tenant não encontrado.');
    }
  }

  private async ensureMetaConnectionExists(
    tenantId: string,
    connectionId: string,
  ): Promise<void> {
    await this.ensureExists(tenantId);
    const count = await this.prisma.tenantMetaConnection.count({
      where: { id: connectionId, tenantId },
    });
    if (count === 0) {
      throw new NotFoundException('Conexão Meta não encontrada.');
    }
  }

  private async ensureOzapConnectionExists(
    tenantId: string,
    connectionId: string,
  ): Promise<void> {
    await this.ensureExists(tenantId);
    const count = await this.prisma.tenantOzapConnection.count({
      where: { id: connectionId, tenantId },
    });
    if (count === 0) {
      throw new NotFoundException('Conexão OZap não encontrada.');
    }
  }

  private async ensureSlugAvailable(
    slug: string,
    ignoreId?: string,
  ): Promise<void> {
    const existing = await this.prisma.tenant.findUnique({ where: { slug } });
    if (existing && existing.id !== ignoreId) {
      throw new ConflictException('Já existe um tenant com este slug.');
    }
  }

  private async ensurePageIdAvailable(pageId: string): Promise<void> {
    const existing = await this.prisma.tenantMetaConnection.findUnique({
      where: { pageId },
    });
    if (existing) {
      throw new ConflictException(
        'Já existe uma conexão Meta com este pageId.',
      );
    }
  }

  private async ensureInstanceIdAvailable(instanceId: number): Promise<void> {
    const existing = await this.prisma.tenantOzapConnection.findUnique({
      where: { instanceId },
    });
    if (existing) {
      throw new ConflictException(
        'Já existe uma conexão OZap com este instanceId.',
      );
    }
  }

  /** Converte violação de unicidade do Prisma (P2002) numa 409 amigável. */
  private translateUniqueConstraint(error: unknown, message: string) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return new ConflictException(message);
    }
    return error;
  }
}
