DO $$ BEGIN
  CREATE TYPE "TwoFactorStatus" AS ENUM ('nao_aplica', 'pendente', 'ativo', 'desativado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "TwoFactorAuditAcao" AS ENUM ('decisao_ativar', 'decisao_desativar', 'ativar', 'desativar');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "twoFactorStatus" "TwoFactorStatus" NOT NULL DEFAULT 'nao_aplica',
  ADD COLUMN IF NOT EXISTS "totpSecretEnc" TEXT,
  ADD COLUMN IF NOT EXISTS "totpBackupHashes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "twoFactorDecidedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "twoFactorChangedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "riskTermsVersion" TEXT,
  ADD COLUMN IF NOT EXISTS "riskAcceptedAt" TIMESTAMP(3);

UPDATE "users"
SET "twoFactorStatus" = 'pendente'
WHERE "role" = 'admin';

CREATE TABLE "two_factor_audit_events" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tenantId" TEXT,
  "acao" "TwoFactorAuditAcao" NOT NULL,
  "termsVersion" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "two_factor_audit_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "platform_notificacoes" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tipo" TEXT NOT NULL,
  "titulo" TEXT NOT NULL,
  "corpo" TEXT NOT NULL,
  "lida" BOOLEAN NOT NULL DEFAULT false,
  "eventoId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_notificacoes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "two_factor_audit_events_userId_createdAt_idx" ON "two_factor_audit_events"("userId", "createdAt");
CREATE INDEX "two_factor_audit_events_tenantId_idx" ON "two_factor_audit_events"("tenantId");
CREATE INDEX "two_factor_audit_events_createdAt_idx" ON "two_factor_audit_events"("createdAt");
CREATE INDEX "platform_notificacoes_userId_lida_idx" ON "platform_notificacoes"("userId", "lida");
CREATE UNIQUE INDEX "platform_notificacoes_eventoId_key" ON "platform_notificacoes"("eventoId");

ALTER TABLE "two_factor_audit_events"
  ADD CONSTRAINT "two_factor_audit_events_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "two_factor_audit_events"
  ADD CONSTRAINT "two_factor_audit_events_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "platform_notificacoes"
  ADD CONSTRAINT "platform_notificacoes_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION prevent_two_factor_audit_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'two_factor_audit_events é imutável';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER two_factor_audit_no_update
BEFORE UPDATE OR DELETE ON "two_factor_audit_events"
FOR EACH ROW EXECUTE FUNCTION prevent_two_factor_audit_mutation();
