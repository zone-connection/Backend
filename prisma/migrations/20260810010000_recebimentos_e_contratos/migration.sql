-- Centro de recebimentos
CREATE TABLE "financeiro_recebimento_tipos" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "natureza" "FinanceiroDespesaNatureza" NOT NULL,
    "orcadoMensal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financeiro_recebimento_tipos_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "financeiro_recebimentos" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tipoId" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "competencia" TEXT NOT NULL DEFAULT '',
    "recorrente" BOOLEAN NOT NULL DEFAULT false,
    "origemId" TEXT,
    "observacao" TEXT NOT NULL DEFAULT '',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financeiro_recebimentos_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "financeiro_recebimento_tipos_tenantId_nome_natureza_key" ON "financeiro_recebimento_tipos"("tenantId", "nome", "natureza");
CREATE INDEX "financeiro_recebimento_tipos_tenantId_idx" ON "financeiro_recebimento_tipos"("tenantId");
CREATE INDEX "financeiro_recebimento_tipos_tenantId_natureza_idx" ON "financeiro_recebimento_tipos"("tenantId", "natureza");
CREATE INDEX "financeiro_recebimentos_tenantId_idx" ON "financeiro_recebimentos"("tenantId");
CREATE INDEX "financeiro_recebimentos_tenantId_data_idx" ON "financeiro_recebimentos"("tenantId", "data");
CREATE INDEX "financeiro_recebimentos_tenantId_competencia_idx" ON "financeiro_recebimentos"("tenantId", "competencia");
CREATE INDEX "financeiro_recebimentos_tipoId_idx" ON "financeiro_recebimentos"("tipoId");
CREATE INDEX "financeiro_recebimentos_origemId_idx" ON "financeiro_recebimentos"("origemId");

ALTER TABLE "financeiro_recebimento_tipos" ADD CONSTRAINT "financeiro_recebimento_tipos_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "financeiro_recebimentos" ADD CONSTRAINT "financeiro_recebimentos_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "financeiro_recebimentos" ADD CONSTRAINT "financeiro_recebimentos_tipoId_fkey" FOREIGN KEY ("tipoId") REFERENCES "financeiro_recebimento_tipos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "financeiro_recebimentos" ADD CONSTRAINT "financeiro_recebimentos_origemId_fkey" FOREIGN KEY ("origemId") REFERENCES "financeiro_recebimentos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Contrato: adesão / mensalidade + vínculo com títulos
ALTER TABLE "platform_contratos" ADD COLUMN "valorAdesao" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "platform_contratos" ADD COLUMN "valorMensalidade" DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE "financeiro_titulos" ADD COLUMN "platformContratoId" TEXT;
CREATE INDEX "financeiro_titulos_platformContratoId_idx" ON "financeiro_titulos"("platformContratoId");
ALTER TABLE "financeiro_titulos" ADD CONSTRAINT "financeiro_titulos_platformContratoId_fkey" FOREIGN KEY ("platformContratoId") REFERENCES "platform_contratos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
