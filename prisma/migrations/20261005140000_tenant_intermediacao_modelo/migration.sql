-- AlterTable
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "intermediacaoModeloUrl" TEXT;
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "intermediacaoModeloPublicId" TEXT;
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "intermediacaoModeloNome" TEXT NOT NULL DEFAULT '';
