-- CreateTable
CREATE TABLE "financeiro_categorias" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "FinanceiroMovimentoTipo" NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financeiro_categorias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "financeiro_categorias_tenantId_idx" ON "financeiro_categorias"("tenantId");

-- CreateIndex
CREATE INDEX "financeiro_categorias_tenantId_tipo_idx" ON "financeiro_categorias"("tenantId", "tipo");

-- CreateIndex
CREATE INDEX "financeiro_categorias_tenantId_ativo_idx" ON "financeiro_categorias"("tenantId", "ativo");

-- CreateIndex
CREATE UNIQUE INDEX "financeiro_categorias_tenantId_nome_tipo_key" ON "financeiro_categorias"("tenantId", "nome", "tipo");

-- AddForeignKey
ALTER TABLE "financeiro_categorias" ADD CONSTRAINT "financeiro_categorias_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
