-- CreateEnum
CREATE TYPE "AtrasoLiberacaoDestino" AS ENUM ('caca_lead', 'retrabalho');

-- AlterTable
ALTER TABLE "funis" ADD COLUMN "atrasoLiberacaoAtiva" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "funis" ADD COLUMN "atrasoLiberacaoDestino" "AtrasoLiberacaoDestino" NOT NULL DEFAULT 'retrabalho';
ALTER TABLE "funis" ADD COLUMN "atrasoLiberacaoValor" INTEGER NOT NULL DEFAULT 24;
ALTER TABLE "funis" ADD COLUMN "atrasoLiberacaoUnidade" "PrazoUnidade" NOT NULL DEFAULT 'horas';

-- AlterTable
ALTER TABLE "leads" ADD COLUMN "origemAtrasoLiberacao" "AtrasoLiberacaoDestino";
ALTER TABLE "leads" ADD COLUMN "atrasoLiberadoAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "leads_tenantId_origemAtrasoLiberacao_idx" ON "leads"("tenantId", "origemAtrasoLiberacao");
