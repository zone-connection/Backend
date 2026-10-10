-- AlterTable
ALTER TABLE "lead_empreendimentos_interesse" ALTER COLUMN "empreendimentoId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "lead_empreendimentos_interesse" ADD COLUMN "imovelId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "lead_empreendimentos_interesse_leadId_imovelId_key" ON "lead_empreendimentos_interesse"("leadId", "imovelId");

-- CreateIndex
CREATE INDEX "lead_empreendimentos_interesse_imovelId_idx" ON "lead_empreendimentos_interesse"("imovelId");

-- AddForeignKey
ALTER TABLE "lead_empreendimentos_interesse" ADD CONSTRAINT "lead_empreendimentos_interesse_imovelId_fkey" FOREIGN KEY ("imovelId") REFERENCES "imoveis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
