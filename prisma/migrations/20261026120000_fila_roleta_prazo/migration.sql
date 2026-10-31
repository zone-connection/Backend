ALTER TYPE "LeadFilaEventoTipo" ADD VALUE IF NOT EXISTS 'redistribuicao';

ALTER TABLE "lead_fila_configs"
  ADD COLUMN IF NOT EXISTS "redistribuirMinutos" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "leads"
  ADD COLUMN IF NOT EXISTS "roletaAtribuidoAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "roletaPrazoAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "roletaRedistribuido" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "leads_roletaPrazoAt_idx" ON "leads"("roletaPrazoAt");
