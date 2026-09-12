-- Premiação avulsa na comissão (valor total + percentuais independentes do rateio).
ALTER TABLE "financeiro_comissoes"
  ADD COLUMN IF NOT EXISTS "valorPremiacao" DECIMAL(18, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "percentualPremiacaoCorretor" DECIMAL(7, 4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "valorPremiacaoCorretor" DECIMAL(18, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "percentualPremiacaoImobiliaria" DECIMAL(7, 4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "valorPremiacaoImobiliaria" DECIMAL(18, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "percentualPremiacaoGerente" DECIMAL(7, 4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "valorPremiacaoGerente" DECIMAL(18, 2) NOT NULL DEFAULT 0;
