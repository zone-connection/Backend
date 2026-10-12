-- Additive only: does not UPDATE existing leads.
-- triagemOrigemHerdada stays NULL for every current row.

ALTER TYPE "TriagemOrigem" ADD VALUE IF NOT EXISTS 'retrabalho';
ALTER TYPE "TriagemOrigem" ADD VALUE IF NOT EXISTS 'caca_lead';

ALTER TABLE "leads"
  ADD COLUMN IF NOT EXISTS "triagemOrigemHerdada" "AtrasoLiberacaoDestino";
