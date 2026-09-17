-- AlterTable
ALTER TABLE "financeiro_titulos" ADD COLUMN IF NOT EXISTS "comissaoId" TEXT;
ALTER TABLE "financeiro_titulos" ADD COLUMN IF NOT EXISTS "comissaoPapel" TEXT;

-- DropIndex (legado 1:1, se existir)
DROP INDEX IF EXISTS "financeiro_titulos_comissaoId_key";

-- CreateIndex
CREATE INDEX IF NOT EXISTS "financeiro_titulos_comissaoId_idx" ON "financeiro_titulos"("comissaoId");

CREATE UNIQUE INDEX IF NOT EXISTS "financeiro_titulos_comissaoId_comissaoPapel_key"
  ON "financeiro_titulos"("comissaoId", "comissaoPapel");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'financeiro_titulos_comissaoId_fkey'
  ) THEN
    ALTER TABLE "financeiro_titulos"
      ADD CONSTRAINT "financeiro_titulos_comissaoId_fkey"
      FOREIGN KEY ("comissaoId") REFERENCES "financeiro_comissoes"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
