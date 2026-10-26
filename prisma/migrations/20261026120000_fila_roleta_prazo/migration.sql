ALTER TYPE "LeadFilaEventoTipo" ADD VALUE IF NOT EXISTS 'redistribuicao';

ALTER TABLE "lead_fila_configs"
  ADD COLUMN "redistribuirMinutos" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "leads"
  ADD COLUMN "roletaAtribuidoAt" TIMESTAMP(3),
  ADD COLUMN "roletaPrazoAt" TIMESTAMP(3),
  ADD COLUMN "roletaRedistribuido" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "leads_roletaPrazoAt_idx" ON "leads"("roletaPrazoAt");
