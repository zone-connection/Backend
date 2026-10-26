DROP TRIGGER IF EXISTS two_factor_audit_no_update ON "two_factor_audit_events";
DROP FUNCTION IF EXISTS prevent_two_factor_audit_mutation();
DROP TABLE IF EXISTS "platform_notificacoes";
DROP TABLE IF EXISTS "two_factor_audit_events";

ALTER TABLE "users" DROP COLUMN IF EXISTS "twoFactorStatus";
ALTER TABLE "users" DROP COLUMN IF EXISTS "totpSecretEnc";
ALTER TABLE "users" DROP COLUMN IF EXISTS "totpBackupHashes";
ALTER TABLE "users" DROP COLUMN IF EXISTS "twoFactorDecidedAt";
ALTER TABLE "users" DROP COLUMN IF EXISTS "twoFactorChangedAt";
ALTER TABLE "users" DROP COLUMN IF EXISTS "riskTermsVersion";
ALTER TABLE "users" DROP COLUMN IF EXISTS "riskAcceptedAt";

DROP TYPE IF EXISTS "TwoFactorStatus";
DROP TYPE IF EXISTS "TwoFactorAuditAcao";
