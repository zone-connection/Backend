ALTER TABLE "financeiro_comissoes"
  ADD COLUMN IF NOT EXISTS "observacao" TEXT NOT NULL DEFAULT '';
