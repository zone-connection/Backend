-- Andamento do processo de obtenção do CRECI no cadastro de usuários.
CREATE TYPE "CreciProcessoStatus" AS ENUM (
  'nao_iniciado',
  'envio_documentacao',
  'pagamento_boleto',
  'aguardando_creci',
  'creci_recebido'
);

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "creciStatus" "CreciProcessoStatus" NOT NULL DEFAULT 'nao_iniciado';

UPDATE "users"
SET "creciStatus" = 'creci_recebido'
WHERE "creci" IS NOT NULL AND btrim("creci") <> '';
