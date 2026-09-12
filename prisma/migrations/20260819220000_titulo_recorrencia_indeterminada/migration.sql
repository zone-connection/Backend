-- Recorrência mensal por tempo indeterminado.
ALTER TABLE "financeiro_titulos"
  ADD COLUMN IF NOT EXISTS "recorrenciaIndeterminada" BOOLEAN NOT NULL DEFAULT false;
