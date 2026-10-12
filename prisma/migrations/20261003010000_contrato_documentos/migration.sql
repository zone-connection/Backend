-- CreateEnum
CREATE TYPE "ContratoDocumentoStatus" AS ENUM ('rascunho', 'baixado');

-- CreateTable
CREATE TABLE "contrato_documentos" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "autorId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "values" JSONB NOT NULL,
    "status" "ContratoDocumentoStatus" NOT NULL DEFAULT 'rascunho',
    "baixadoAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contrato_documentos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contrato_documentos_tenantId_status_updatedAt_idx" ON "contrato_documentos"("tenantId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "contrato_documentos_autorId_idx" ON "contrato_documentos"("autorId");

-- AddForeignKey
ALTER TABLE "contrato_documentos" ADD CONSTRAINT "contrato_documentos_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contrato_documentos" ADD CONSTRAINT "contrato_documentos_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
