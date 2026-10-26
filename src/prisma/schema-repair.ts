import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaService } from './prisma.service';
import { ensureLembretesPessoaisSchema } from '../lembretes/lembretes.schema';

const logger = new Logger('SchemaRepair');

export function isMissingDatabaseObject(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    return (
      err.code === 'P2021' ||
      err.code === 'P2022' ||
      err.code === 'P2010'
    );
  }
  const message = err instanceof Error ? err.message : String(err);
  return /does not exist|não existe|Unknown (?:column|table|arg)|column .* does not exist/i.test(
    message,
  );
}

const POS_VENDA_STATEMENTS = [
  `ALTER TYPE "FunilEtapaPapel" ADD VALUE IF NOT EXISTS 'concluido'`,
  `ALTER TYPE "FunilTipo" ADD VALUE IF NOT EXISTS 'pos_venda'`,
  `
    ALTER TABLE "vendas_usado"
      ADD COLUMN IF NOT EXISTS "posVendaRecusadoEm" TIMESTAMP(3),
      ADD COLUMN IF NOT EXISTS "posVendaRecusadoPorId" TEXT
  `,
  `
    ALTER TABLE "venda_usado_pos_vendas"
      ADD COLUMN IF NOT EXISTS "funilId" TEXT,
      ADD COLUMN IF NOT EXISTS "funilEtapaId" TEXT,
      ADD COLUMN IF NOT EXISTS "encaminhadoEm" TIMESTAMP(3),
      ADD COLUMN IF NOT EXISTS "encaminhadoPorId" TEXT,
      ADD COLUMN IF NOT EXISTS "stageEnteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ADD COLUMN IF NOT EXISTS "lastStageChangeAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ADD COLUMN IF NOT EXISTS "lastMovementAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ADD COLUMN IF NOT EXISTS "prazoDueAt" TIMESTAMP(3),
      ADD COLUMN IF NOT EXISTS "alertaProximoAt" TIMESTAMP(3),
      ADD COLUMN IF NOT EXISTS "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]
  `,
  `
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'vendas_usado_posVendaRecusadoPorId_fkey'
      ) THEN
        ALTER TABLE "vendas_usado"
          ADD CONSTRAINT "vendas_usado_posVendaRecusadoPorId_fkey"
          FOREIGN KEY ("posVendaRecusadoPorId") REFERENCES "users"("id")
          ON DELETE SET NULL ON UPDATE CASCADE;
      END IF;
    END $$
  `,
  `
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'venda_usado_pos_vendas_funilId_fkey'
      ) THEN
        ALTER TABLE "venda_usado_pos_vendas"
          ADD CONSTRAINT "venda_usado_pos_vendas_funilId_fkey"
          FOREIGN KEY ("funilId") REFERENCES "funis"("id")
          ON DELETE RESTRICT ON UPDATE CASCADE;
      END IF;
    END $$
  `,
  `
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'venda_usado_pos_vendas_funilEtapaId_fkey'
      ) THEN
        ALTER TABLE "venda_usado_pos_vendas"
          ADD CONSTRAINT "venda_usado_pos_vendas_funilEtapaId_fkey"
          FOREIGN KEY ("funilEtapaId") REFERENCES "funil_etapas"("id")
          ON DELETE RESTRICT ON UPDATE CASCADE;
      END IF;
    END $$
  `,
  `
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'venda_usado_pos_vendas_encaminhadoPorId_fkey'
      ) THEN
        ALTER TABLE "venda_usado_pos_vendas"
          ADD CONSTRAINT "venda_usado_pos_vendas_encaminhadoPorId_fkey"
          FOREIGN KEY ("encaminhadoPorId") REFERENCES "users"("id")
          ON DELETE SET NULL ON UPDATE CASCADE;
      END IF;
    END $$
  `,
  `CREATE INDEX IF NOT EXISTS "venda_usado_pos_vendas_tenantId_funilEtapaId_idx"
     ON "venda_usado_pos_vendas"("tenantId", "funilEtapaId")`,
  `CREATE INDEX IF NOT EXISTS "venda_usado_pos_vendas_tenantId_responsavelId_idx"
     ON "venda_usado_pos_vendas"("tenantId", "responsavelId")`,
];

export async function ensurePosVendaSchema(prisma: PrismaService) {
  for (const sql of POS_VENDA_STATEMENTS) {
    await prisma.$executeRawUnsafe(sql);
  }
}

const ROLETA_STATEMENTS = [
  `ALTER TYPE "LeadFilaEventoTipo" ADD VALUE IF NOT EXISTS 'redistribuicao'`,
  `
    ALTER TABLE "leads"
      ADD COLUMN IF NOT EXISTS "roletaAtribuidoAt" TIMESTAMP(3),
      ADD COLUMN IF NOT EXISTS "roletaPrazoAt" TIMESTAMP(3),
      ADD COLUMN IF NOT EXISTS "roletaRedistribuido" BOOLEAN NOT NULL DEFAULT false
  `,
  `CREATE INDEX IF NOT EXISTS "leads_roletaPrazoAt_idx" ON "leads"("roletaPrazoAt")`,
  `
    ALTER TABLE "lead_fila_configs"
      ADD COLUMN IF NOT EXISTS "redistribuirMinutos" INTEGER NOT NULL DEFAULT 0
  `,
];

export async function ensureRoletaSchema(prisma: PrismaService) {
  for (const sql of ROLETA_STATEMENTS) {
    try {
      await prisma.$executeRawUnsafe(sql);
    } catch (err) {
      logger.warn(
        `Trecho da roleta não aplicado: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}

export async function ensureRuntimeSchema(prisma: PrismaService) {
  try {
    await ensureRoletaSchema(prisma);
  } catch (err) {
    logger.error(
      'Não foi possível alinhar o schema da roleta.',
      err instanceof Error ? err.stack : err,
    );
  }
  try {
    await ensurePosVendaSchema(prisma);
  } catch (err) {
    logger.error(
      'Não foi possível alinhar o schema de pós-venda.',
      err instanceof Error ? err.stack : err,
    );
  }
  try {
    await ensureLembretesPessoaisSchema(prisma);
  } catch (err) {
    logger.error(
      'Não foi possível alinhar o schema de lembretes.',
      err instanceof Error ? err.stack : err,
    );
  }
}
