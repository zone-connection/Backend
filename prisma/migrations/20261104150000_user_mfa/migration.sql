DO $$ BEGIN
  CREATE TYPE "MfaDecision" AS ENUM ('manter', 'recusar');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "MfaAuditEvent" AS ENUM ('ativacao', 'desativacao', 'falha', 'regeneracao', 'recuperacao', 'decisao');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "totpSecretEnc" TEXT,
  ADD COLUMN IF NOT EXISTS "totpPendingEnc" TEXT,
  ADD COLUMN IF NOT EXISTS "totpEnabledAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "totpDisabledAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "totpLastStep" INTEGER,
  ADD COLUMN IF NOT EXISTS "mfaFailedAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "mfaLockedUntil" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "mfaDecision" "MfaDecision",
  ADD COLUMN IF NOT EXISTS "mfaDecisionAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "user_mfa_recovery_codes" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "usedAt" TIMESTAMP(3),
  CONSTRAINT "user_mfa_recovery_codes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "user_mfa_audit" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "event" "MfaAuditEvent" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_mfa_audit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "user_mfa_recovery_codes_userId_idx" ON "user_mfa_recovery_codes"("userId");
CREATE INDEX IF NOT EXISTS "user_mfa_audit_userId_createdAt_idx" ON "user_mfa_audit"("userId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "user_mfa_recovery_codes"
    ADD CONSTRAINT "user_mfa_recovery_codes_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "user_mfa_audit"
    ADD CONSTRAINT "user_mfa_audit_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
