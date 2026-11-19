import { Logger } from '@nestjs/common';
import type { PrismaService } from './prisma.service';

const logger = new Logger('OzapSchema');

export async function ensureOzapApiKeyColumn(prisma: PrismaService) {
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "tenant_ozap_connections"
        ADD COLUMN IF NOT EXISTS "ozapApiKey" TEXT
    `);
  } catch (err) {
    logger.error(
      'Não foi possível criar a coluna da chave OZap.',
      err instanceof Error ? err.stack : err,
    );
  }
}
