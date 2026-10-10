-- E-mail de preferência para avisos (não altera o e-mail de login).
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "notifyEmail" TEXT;
