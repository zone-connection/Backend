-- CreateEnum
CREATE TYPE "PropostaHistoricoAtor" AS ENUM ('comprador', 'corretor', 'proprietario', 'sistema');

ALTER TYPE "NotificacaoTipo" ADD VALUE IF NOT EXISTS 'proposta_publica_recebida';
ALTER TYPE "NotificacaoTipo" ADD VALUE IF NOT EXISTS 'proposta_publica_aceita';

ALTER TABLE "propostas"
ADD COLUMN "origemPublica" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "linkId" TEXT,
ADD COLUMN "compradorToken" TEXT,
ADD COLUMN "aceitaEm" TIMESTAMP(3),
ADD COLUMN "aceitaPorProprietarioId" TEXT,
ADD COLUMN "visualizadaNoPortalEm" TIMESTAMP(3);

CREATE UNIQUE INDEX "propostas_compradorToken_key" ON "propostas"("compradorToken");
CREATE INDEX "propostas_origemPublica_idx" ON "propostas"("origemPublica");

CREATE TABLE "proposta_publica_links" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "imovelId" TEXT NOT NULL,
    "proprietarioId" TEXT NOT NULL,
    "corretorId" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proposta_publica_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "proposta_publica_links_token_key" ON "proposta_publica_links"("token");
CREATE UNIQUE INDEX "proposta_publica_links_imovelId_corretorId_key" ON "proposta_publica_links"("imovelId", "corretorId");
CREATE INDEX "proposta_publica_links_tenantId_imovelId_idx" ON "proposta_publica_links"("tenantId", "imovelId");
CREATE INDEX "proposta_publica_links_tenantId_corretorId_idx" ON "proposta_publica_links"("tenantId", "corretorId");

CREATE TABLE "proposta_historicos" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "propostaId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "payload" JSONB,
    "atorTipo" "PropostaHistoricoAtor" NOT NULL,
    "atorId" TEXT,
    "atorNome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proposta_historicos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "proposta_historicos_propostaId_createdAt_idx" ON "proposta_historicos"("propostaId", "createdAt");
CREATE INDEX "proposta_historicos_tenantId_createdAt_idx" ON "proposta_historicos"("tenantId", "createdAt");

ALTER TABLE "propostas"
ADD CONSTRAINT "propostas_linkId_fkey"
FOREIGN KEY ("linkId") REFERENCES "proposta_publica_links"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "propostas"
ADD CONSTRAINT "propostas_aceitaPorProprietarioId_fkey"
FOREIGN KEY ("aceitaPorProprietarioId") REFERENCES "proprietarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "proposta_publica_links"
ADD CONSTRAINT "proposta_publica_links_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "proposta_publica_links"
ADD CONSTRAINT "proposta_publica_links_imovelId_fkey"
FOREIGN KEY ("imovelId") REFERENCES "imoveis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "proposta_publica_links"
ADD CONSTRAINT "proposta_publica_links_proprietarioId_fkey"
FOREIGN KEY ("proprietarioId") REFERENCES "proprietarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "proposta_publica_links"
ADD CONSTRAINT "proposta_publica_links_corretorId_fkey"
FOREIGN KEY ("corretorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "proposta_historicos"
ADD CONSTRAINT "proposta_historicos_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "proposta_historicos"
ADD CONSTRAINT "proposta_historicos_propostaId_fkey"
FOREIGN KEY ("propostaId") REFERENCES "propostas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
