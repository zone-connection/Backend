-- Núcleo da API v1: aplicação, autorização por tenant e auditoria.
-- Não armazena client secret nem access token.

CREATE TYPE "ApiAplicacaoStatus" AS ENUM ('ativa', 'inativa');
CREATE TYPE "ApiAutorizacaoStatus" AS ENUM ('ativa', 'revogada');

CREATE TABLE "api_aplicacoes" (
  "id" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "descricao" TEXT NOT NULL DEFAULT '',
  "status" "ApiAplicacaoStatus" NOT NULL DEFAULT 'ativa',
  "clientId" TEXT NOT NULL,
  "segredoHash" TEXT NOT NULL,
  "credencialVersao" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "api_aplicacoes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "api_aplicacoes_clientId_key" ON "api_aplicacoes"("clientId");

CREATE TABLE "api_autorizacoes" (
  "id" TEXT NOT NULL,
  "aplicacaoId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "status" "ApiAutorizacaoStatus" NOT NULL DEFAULT 'ativa',
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "api_autorizacoes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "api_autorizacoes_aplicacaoId_tenantId_key"
  ON "api_autorizacoes"("aplicacaoId", "tenantId");
CREATE INDEX "api_autorizacoes_tenantId_status_idx"
  ON "api_autorizacoes"("tenantId", "status");

ALTER TABLE "api_autorizacoes"
  ADD CONSTRAINT "api_autorizacoes_aplicacaoId_fkey"
  FOREIGN KEY ("aplicacaoId") REFERENCES "api_aplicacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "api_autorizacoes"
  ADD CONSTRAINT "api_autorizacoes_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "api_auditorias" (
  "id" TEXT NOT NULL,
  "aplicacaoId" TEXT,
  "tenantId" TEXT,
  "method" TEXT NOT NULL,
  "path" TEXT NOT NULL,
  "statusCode" INTEGER NOT NULL,
  "duracaoMs" INTEGER NOT NULL,
  "requestId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "api_auditorias_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "api_auditorias_aplicacaoId_createdAt_idx"
  ON "api_auditorias"("aplicacaoId", "createdAt");
CREATE INDEX "api_auditorias_tenantId_createdAt_idx"
  ON "api_auditorias"("tenantId", "createdAt");

ALTER TABLE "api_auditorias"
  ADD CONSTRAINT "api_auditorias_aplicacaoId_fkey"
  FOREIGN KEY ("aplicacaoId") REFERENCES "api_aplicacoes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
