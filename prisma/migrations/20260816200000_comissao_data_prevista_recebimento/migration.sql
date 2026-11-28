-- AlterTable
ALTER TABLE "financeiro_comissoes"
  ADD COLUMN IF NOT EXISTS "dataPrevistaRecebimento" TIMESTAMP(3);

UPDATE "financeiro_comissoes"
SET "dataPrevistaRecebimento" = "dataVenda"
WHERE "dataPrevistaRecebimento" IS NULL;

ALTER TABLE "financeiro_comissoes"
  ALTER COLUMN "dataPrevistaRecebimento" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "financeiro_comissoes_tenantId_dataPrevistaRecebimento_idx"
  ON "financeiro_comissoes"("tenantId", "dataPrevistaRecebimento");
