-- Imposto e restante da premiação em cascata (cada % incide sobre o saldo anterior).
ALTER TABLE "financeiro_comissoes"
  ADD COLUMN IF NOT EXISTS "percentualPremiacaoImposto" DECIMAL(7, 4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "valorPremiacaoImposto" DECIMAL(18, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "valorPremiacaoRestante" DECIMAL(18, 2) NOT NULL DEFAULT 0;
