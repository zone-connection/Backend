import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_TENANT_ID } from '../common/utils/tenant';
import { encryptSecret, metaTokenKey } from '../meta/meta-token.crypto';

/**
 * Migra conexões Meta/OZap do .env para o tenant default (uma vez),
 * enquanto a UI de gestão ainda não é o fluxo principal.
 */
@Injectable()
export class BootstrapTenantConnectionsService implements OnModuleInit {
  private readonly logger = new Logger(BootstrapTenantConnectionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: DEFAULT_TENANT_ID },
      select: { id: true },
    });
    if (!tenant) {
      this.logger.warn(
        `Tenant default ${DEFAULT_TENANT_ID} não encontrado — conexões env não migradas.`,
      );
      return;
    }

    await this.seedMeta(tenant.id);
    await this.seedOzap(tenant.id);
  }

  private async seedMeta(tenantId: string) {
    const pageId = this.config.get<string>('META_PAGE_ID')?.trim();
    const pageAccessToken = this.config
      .get<string>('META_PAGE_ACCESS_TOKEN')
      ?.trim();
    if (!pageId || !pageAccessToken) return;

    const existing = await this.prisma.tenantMetaConnection.findUnique({
      where: { pageId },
    });
    if (existing) return;

    await this.prisma.tenantMetaConnection.create({
      data: {
        id: randomUUID(),
        tenantId,
        pageId,
        pageAccessToken: encryptSecret(
          pageAccessToken,
          metaTokenKey(this.config),
        ),
        ativo: true,
      },
    });
    this.logger.log(
      `TenantMetaConnection criada a partir do env (pageId=${pageId}).`,
    );
  }

  private async seedOzap(tenantId: string) {
    const raw = this.config.get<string>('OZAP_INSTANCE_ID')?.trim();
    if (!raw) return;
    const instanceId = Number(raw);
    if (!Number.isInteger(instanceId)) return;

    const existing = await this.prisma.tenantOzapConnection.findUnique({
      where: { instanceId },
    });
    if (existing) return;

    await this.prisma.tenantOzapConnection.create({
      data: {
        id: randomUUID(),
        tenantId,
        instanceId,
        ativo: true,
      },
    });
    this.logger.log(
      `TenantOzapConnection criada a partir do env (instanceId=${instanceId}).`,
    );
  }
}
