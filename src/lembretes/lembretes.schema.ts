import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export function isLembretesSchemaMissing(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    return err.code === 'P2021' || err.code === 'P2010' || err.code === 'P2022';
  }
  const message = err instanceof Error ? err.message : String(err);
  return (
    /lembretes_pessoais/i.test(message) &&
    /does not exist|não existe|Unknown table|relation/i.test(message)
  );
}

export async function ensureLembretesPessoaisSchema(prisma: PrismaService) {
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      CREATE TYPE "LembretePessoalRecorrencia" AS ENUM (
        'sempre', 'diaria', 'semanal', 'mensal', 'uma_vez'
      );
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "lembretes_pessoais" (
      "id" TEXT NOT NULL,
      "tenantId" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "titulo" TEXT NOT NULL,
      "descricao" TEXT NOT NULL DEFAULT '',
      "ativo" BOOLEAN NOT NULL DEFAULT true,
      "recorrencia" "LembretePessoalRecorrencia" NOT NULL DEFAULT 'sempre',
      "reconhecidoEm" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "lembretes_pessoais_pkey" PRIMARY KEY ("id")
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "lembretes_pessoais_userId_ativo_idx"
      ON "lembretes_pessoais"("userId", "ativo");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "lembretes_pessoais_tenantId_userId_idx"
      ON "lembretes_pessoais"("tenantId", "userId");
  `);

  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "lembretes_pessoais"
        ADD CONSTRAINT "lembretes_pessoais_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "lembretes_pessoais"
        ADD CONSTRAINT "lembretes_pessoais_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "users"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);
}
