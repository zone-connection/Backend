import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ensureRuntimeSchema } from './schema-repair';
import { ensureOzapApiKeyColumn } from './ozap-schema';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    await this.$connect();
    try {
      await ensureRuntimeSchema(this);
      await ensureOzapApiKeyColumn(this);
    } catch (err) {
      this.logger.error(
        'Não foi possível alinhar o schema no boot.',
        err instanceof Error ? err.stack : err,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
