-- CRECI opcional no cadastro de usuários.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "creci" TEXT;
