-- CreateEnum
CREATE TYPE "EmpreendimentoTipo" AS ENUM ('vertical', 'casa', 'loteamento', 'comercial');

-- CreateEnum
CREATE TYPE "EmpreendimentoStatus" AS ENUM ('lancamento', 'em_obras', 'pronto');

-- AlterTable
ALTER TABLE "empreendimentos" ADD COLUMN "localidadeId" TEXT;
ALTER TABLE "empreendimentos" ADD COLUMN "tipo" "EmpreendimentoTipo";
ALTER TABLE "empreendimentos" ADD COLUMN "status" "EmpreendimentoStatus";
ALTER TABLE "empreendimentos" ADD COLUMN "previsaoEntrega" DATE;
ALTER TABLE "empreendimentos" ADD COLUMN "litoral" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "empreendimentos" ADD COLUMN "aceitaFgts" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "empreendimentos" ADD COLUMN "aceitaMcmv" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "empreendimentos" ADD COLUMN "aceitaCaixa" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "empreendimentos" ADD COLUMN "observacao" TEXT;

-- CreateIndex
CREATE INDEX "empreendimentos_localidadeId_idx" ON "empreendimentos"("localidadeId");

-- AddForeignKey
ALTER TABLE "empreendimentos" ADD CONSTRAINT "empreendimentos_localidadeId_fkey" FOREIGN KEY ("localidadeId") REFERENCES "localidades"("id") ON DELETE SET NULL ON UPDATE CASCADE;
