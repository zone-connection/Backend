-- CreateTable
CREATE TABLE "lead_reatribuicoes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "fromCorretorId" TEXT,
    "fromEquipeId" TEXT,
    "toCorretorId" TEXT,
    "toEquipeId" TEXT,
    "origem" "TriagemOrigem" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_reatribuicoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lead_reatribuicoes_tenantId_fromCorretorId_idx" ON "lead_reatribuicoes"("tenantId", "fromCorretorId");

-- CreateIndex
CREATE INDEX "lead_reatribuicoes_tenantId_fromEquipeId_idx" ON "lead_reatribuicoes"("tenantId", "fromEquipeId");

-- CreateIndex
CREATE INDEX "lead_reatribuicoes_leadId_idx" ON "lead_reatribuicoes"("leadId");

-- CreateIndex
CREATE INDEX "lead_reatribuicoes_createdAt_idx" ON "lead_reatribuicoes"("createdAt");

-- AddForeignKey
ALTER TABLE "lead_reatribuicoes" ADD CONSTRAINT "lead_reatribuicoes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_reatribuicoes" ADD CONSTRAINT "lead_reatribuicoes_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
