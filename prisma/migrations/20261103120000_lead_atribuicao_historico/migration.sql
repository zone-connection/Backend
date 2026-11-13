DO $$ BEGIN
  CREATE TYPE "LeadAtribuicaoAcao" AS ENUM (
    'entrada',
    'distribuicao',
    'reatribuicao',
    'troca_equipe',
    'roleta',
    'redistribuicao',
    'desvinculo',
    'caca'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "lead_reatribuicoes"
  ADD COLUMN IF NOT EXISTS "actorId" TEXT,
  ADD COLUMN IF NOT EXISTS "acao" "LeadAtribuicaoAcao" NOT NULL DEFAULT 'reatribuicao';

DO $$ BEGIN
  ALTER TABLE "lead_reatribuicoes"
    ADD CONSTRAINT "lead_reatribuicoes_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "lead_reatribuicoes_actorId_idx" ON "lead_reatribuicoes"("actorId");
