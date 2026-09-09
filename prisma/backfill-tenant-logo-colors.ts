import { PrismaClient } from '@prisma/client';
import { TenantLogoColorService } from '../src/tenants/tenant-logo-color.service';

const prisma = new PrismaClient();
const logoColorService = new TenantLogoColorService();
const PAGE_SIZE = 50;

async function main() {
  let cursor: string | undefined;
  let analyzed = 0;
  let updated = 0;

  for (;;) {
    const tenants = await prisma.tenant.findMany({
      where: {
        logoUrl: { not: null },
        primaryColor: null,
      },
      select: { id: true, logoUrl: true },
      orderBy: { id: 'asc' },
      take: PAGE_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (tenants.length === 0) break;

    for (const tenant of tenants) {
      analyzed += 1;
      try {
        const primaryColor = await logoColorService.extractPrimaryColor(
          tenant.logoUrl,
        );
        if (primaryColor) {
          await prisma.tenant.update({
            where: { id: tenant.id },
            data: { primaryColor },
          });
          updated += 1;
        }
      } catch (error) {
        // A stale/private URL must not prevent remaining tenants from backfilling.
        console.warn(`Skipped tenant ${tenant.id}:`, error);
      }
    }
    cursor = tenants.at(-1)?.id;
  }

  console.info(`Logo color backfill complete: ${updated}/${analyzed} tenants updated.`);
}

main()
  .catch((error) => {
    console.error('Logo color backfill failed.', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
