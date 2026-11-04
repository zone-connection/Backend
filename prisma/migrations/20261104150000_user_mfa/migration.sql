CREATE TYPE "MfaDecision" AS ENUM ('manter', 'recusar');
CREATE TYPE "MfaAuditEvent" AS ENUM ('ativacao', 'desativacao', 'falha', 'regeneracao', 'recuperacao', 'decisao');

ALTER TABLE "users"
  ADD COLUMN "totpSecretEnc" TEXT,
  ADD COLUMN "totpPendingEnc" TEXT,
  ADD COLUMN "totpEnabledAt" TIMESTAMP(3),
  ADD COLUMN "totpDisabledAt" TIMESTAMP(3),
  ADD COLUMN "totpLastStep" INTEGER,
  ADD COLUMN "mfaFailedAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "mfaLockedUntil" TIMESTAMP(3),
  ADD COLUMN "mfaDecision" "MfaDecision",
  ADD COLUMN "mfaDecisionAt" TIMESTAMP(3);

CREATE TABLE "user_mfa_recovery_codes" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "usedAt" TIMESTAMP(3),
  CONSTRAINT "user_mfa_recovery_codes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "user_mfa_audit" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "event" "MfaAuditEvent" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_mfa_audit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "user_mfa_recovery_codes_userId_idx" ON "user_mfa_recovery_codes"("userId");
CREATE INDEX "user_mfa_audit_userId_createdAt_idx" ON "user_mfa_audit"("userId", "createdAt");

ALTER TABLE "user_mfa_recovery_codes"
  ADD CONSTRAINT "user_mfa_recovery_codes_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_mfa_audit"
  ADD CONSTRAINT "user_mfa_audit_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
