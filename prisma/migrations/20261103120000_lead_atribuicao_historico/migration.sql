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

ALTER TABLE "lead_reatribuicoes"
  ADD COLUMN "actorId" TEXT,
  ADD COLUMN "acao" "LeadAtribuicaoAcao" NOT NULL DEFAULT 'reatribuicao';

ALTER TABLE "lead_reatribuicoes"
  ADD CONSTRAINT "lead_reatribuicoes_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "lead_reatribuicoes_actorId_idx" ON "lead_reatribuicoes"("actorId");
