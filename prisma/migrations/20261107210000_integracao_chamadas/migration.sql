CREATE TABLE "integracao_chamadas" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "leadId" TEXT,
  "telefone" TEXT NOT NULL DEFAULT '',
  "funilId" TEXT,
  "etapaSlug" TEXT,
  "inicioEm" TIMESTAMP(3),
  "fimEm" TIMESTAMP(3),
  "resumo" TEXT NOT NULL DEFAULT '',
  "transcricao" TEXT NOT NULL DEFAULT '',
  "resultado" TEXT NOT NULL DEFAULT '',
  "imoveisOfertados" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "integracao_chamadas_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "integracao_chamadas_tenantId_externalId_key" ON "integracao_chamadas"("tenantId", "externalId");
CREATE INDEX "integracao_chamadas_tenantId_leadId_idx" ON "integracao_chamadas"("tenantId", "leadId");

ALTER TABLE "integracao_chamadas" ADD CONSTRAINT "integracao_chamadas_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
