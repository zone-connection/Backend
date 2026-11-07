-- Processed Word template with CRM placeholders for intermediacao.
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "intermediacaoTemplateUrl" TEXT;
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "intermediacaoTemplatePublicId" TEXT;
