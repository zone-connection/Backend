-- Data de nascimento no cadastro de usuários/corretores.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "dataNascimento" TIMESTAMP(3);
