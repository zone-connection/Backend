-- Novos componentes financeiros da proposta comercial.
ALTER TABLE "propostas" ADD COLUMN IF NOT EXISTS "apartado" INTEGER;
ALTER TABLE "propostas" ADD COLUMN IF NOT EXISTS "preChaves" INTEGER;
ALTER TABLE "propostas" ADD COLUMN IF NOT EXISTS "posChaves" INTEGER;
ALTER TABLE "propostas" ADD COLUMN IF NOT EXISTS "intercaladas" INTEGER;
ALTER TABLE "propostas" ADD COLUMN IF NOT EXISTS "fgts" INTEGER;
ALTER TABLE "propostas" ADD COLUMN IF NOT EXISTS "moraBem" INTEGER;
ALTER TABLE "propostas" ADD COLUMN IF NOT EXISTS "mcmv" INTEGER;
ALTER TABLE "propostas" ADD COLUMN IF NOT EXISTS "parcelaCaixa" INTEGER;
