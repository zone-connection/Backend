-- AlterTable
ALTER TABLE "tenants" ADD COLUMN "isTest" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "tenants_isTest_idx" ON "tenants"("isTest");

-- Backfill: nomes/slugs já usados como ambiente de teste
UPDATE "tenants"
SET "isTest" = true
WHERE name ILIKE '%teste%'
   OR slug ILIKE '%teste%';
