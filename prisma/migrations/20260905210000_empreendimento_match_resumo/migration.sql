-- A tabela real é "empreendimentos" (@@map). IF NOT EXISTS cobre retry após P3009.
ALTER TABLE "empreendimentos" ADD COLUMN IF NOT EXISTS "matchTotal" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "empreendimentos" ADD COLUMN IF NOT EXISTS "matchMuitoCompativeis" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "empreendimentos" ADD COLUMN IF NOT EXISTS "matchInteressePrevio" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "empreendimentos" ADD COLUMN IF NOT EXISTS "matchComputedAt" TIMESTAMP(3);
