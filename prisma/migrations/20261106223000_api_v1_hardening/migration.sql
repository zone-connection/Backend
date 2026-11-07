-- Hardening da API v1. Seguro se a migration anterior já tiver sido aplicada.

ALTER TABLE "api_aplicacoes" DROP COLUMN IF EXISTS "segredoPrefixo";
ALTER TABLE "api_aplicacoes"
  ADD COLUMN IF NOT EXISTS "credencialVersao" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS "api_oauth_tentativas" (
  "chave" TEXT NOT NULL,
  "falhas" INTEGER NOT NULL DEFAULT 0,
  "bloqueadoAte" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "api_oauth_tentativas_pkey" PRIMARY KEY ("chave")
);
