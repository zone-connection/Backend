-- Vínculo individual de proposta comercial com imóvel ou empreendimento.

CREATE TABLE "proposta_vinculos" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "propostaId" TEXT NOT NULL,
    "imovelId" TEXT,
    "empreendimentoId" TEXT,
    "proprietarioId" TEXT,
    "corretorId" TEXT,
    "corretorNome" TEXT NOT NULL,
    "vinculadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removidoEm" TIMESTAMP(3),
    "removidoPorId" TEXT,
    "removidoPorNome" TEXT,

    CONSTRAINT "proposta_vinculos_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "proposta_vinculo_notificacoes" (
    "id" TEXT NOT NULL,
    "vinculoId" TEXT NOT NULL,
    "email" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL,
    "detalhe" TEXT NOT NULL DEFAULT '',
    "enviadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proposta_vinculo_notificacoes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "proposta_vinculos_tenantId_propostaId_idx" ON "proposta_vinculos"("tenantId", "propostaId");
CREATE INDEX "proposta_vinculos_tenantId_imovelId_idx" ON "proposta_vinculos"("tenantId", "imovelId");
CREATE INDEX "proposta_vinculos_tenantId_empreendimentoId_idx" ON "proposta_vinculos"("tenantId", "empreendimentoId");
CREATE INDEX "proposta_vinculos_tenantId_proprietarioId_idx" ON "proposta_vinculos"("tenantId", "proprietarioId");
CREATE INDEX "proposta_vinculo_notificacoes_vinculoId_idx" ON "proposta_vinculo_notificacoes"("vinculoId");

CREATE UNIQUE INDEX "proposta_vinculos_proposta_imovel_ativo_key"
ON "proposta_vinculos" ("propostaId", "imovelId")
WHERE "removidoEm" IS NULL AND "imovelId" IS NOT NULL;

CREATE UNIQUE INDEX "proposta_vinculos_proposta_empreendimento_ativo_key"
ON "proposta_vinculos" ("propostaId", "empreendimentoId")
WHERE "removidoEm" IS NULL AND "empreendimentoId" IS NOT NULL;

ALTER TABLE "proposta_vinculos"
ADD CONSTRAINT "proposta_vinculos_alvo_check"
CHECK (
    ("imovelId" IS NOT NULL AND "empreendimentoId" IS NULL)
    OR ("imovelId" IS NULL AND "empreendimentoId" IS NOT NULL)
);

ALTER TABLE "proposta_vinculos"
ADD CONSTRAINT "proposta_vinculos_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "proposta_vinculos"
ADD CONSTRAINT "proposta_vinculos_propostaId_fkey"
FOREIGN KEY ("propostaId") REFERENCES "propostas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "proposta_vinculos"
ADD CONSTRAINT "proposta_vinculos_imovelId_fkey"
FOREIGN KEY ("imovelId") REFERENCES "imoveis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "proposta_vinculos"
ADD CONSTRAINT "proposta_vinculos_empreendimentoId_fkey"
FOREIGN KEY ("empreendimentoId") REFERENCES "empreendimentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "proposta_vinculos"
ADD CONSTRAINT "proposta_vinculos_proprietarioId_fkey"
FOREIGN KEY ("proprietarioId") REFERENCES "proprietarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "proposta_vinculos"
ADD CONSTRAINT "proposta_vinculos_corretorId_fkey"
FOREIGN KEY ("corretorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "proposta_vinculos"
ADD CONSTRAINT "proposta_vinculos_removidoPorId_fkey"
FOREIGN KEY ("removidoPorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "proposta_vinculo_notificacoes"
ADD CONSTRAINT "proposta_vinculo_notificacoes_vinculoId_fkey"
FOREIGN KEY ("vinculoId") REFERENCES "proposta_vinculos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
