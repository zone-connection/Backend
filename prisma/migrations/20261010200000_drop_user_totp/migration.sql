ALTER TABLE "users" DROP COLUMN IF EXISTS "totpSecret";
ALTER TABLE "users" DROP COLUMN IF EXISTS "totpEnabledAt";
ALTER TABLE "users" DROP COLUMN IF EXISTS "totpBackupHashes";
ALTER TABLE "users" DROP COLUMN IF EXISTS "totpTicketNonce";
