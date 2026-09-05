-- Prospecção B2B do tenant da plataforma (Zone Connection).
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "prospeccao" JSONB;
