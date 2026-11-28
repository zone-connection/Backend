-- Map of snippets for filling the agency PDF/Word template.
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "intermediacaoCampoMap" JSONB;
