-- AlterEnum
ALTER TYPE "FinanceiroDespesaNatureza" ADD VALUE IF NOT EXISTS 'fixa_variavel';

-- AlterTable
ALTER TABLE "financeiro_despesas" ADD COLUMN IF NOT EXISTS "competencia" TEXT NOT NULL DEFAULT '';
ALTER TABLE "financeiro_despesas" ADD COLUMN IF NOT EXISTS "recorrente" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "financeiro_despesas" ADD COLUMN IF NOT EXISTS "origemId" TEXT;

-- Backfill competencia from data (America/Sao_Paulo approx via UTC-3 date)
UPDATE "financeiro_despesas"
SET "competencia" = to_char(("data" AT TIME ZONE 'UTC' - INTERVAL '3 hours'), 'YYYY-MM')
WHERE "competencia" = '' OR "competencia" IS NULL;

-- Mark existing fixa despesas as recorrente by default
UPDATE "financeiro_despesas" d
SET "recorrente" = true
FROM "financeiro_despesa_tipos" t
WHERE d."tipoId" = t.id
  AND t.natureza = 'fixa'
  AND d."origemId" IS NULL;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "financeiro_despesas_tenantId_competencia_idx" ON "financeiro_despesas"("tenantId", "competencia");
CREATE INDEX IF NOT EXISTS "financeiro_despesas_origemId_idx" ON "financeiro_despesas"("origemId");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'financeiro_despesas_origemId_fkey'
  ) THEN
    ALTER TABLE "financeiro_despesas"
      ADD CONSTRAINT "financeiro_despesas_origemId_fkey"
      FOREIGN KEY ("origemId") REFERENCES "financeiro_despesas"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
