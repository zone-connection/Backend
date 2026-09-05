-- AlterEnum
ALTER TYPE "CaptacaoHistoricoTipo" ADD VALUE 'portal_acao';
ALTER TYPE "VendaUsadoHistoricoTipo" ADD VALUE 'portal_acao';

-- CreateTable
CREATE TABLE "imovel_fotos" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "imovelId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imovel_fotos_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "imovel_fotos_imovelId_sortOrder_key" ON "imovel_fotos"("imovelId", "sortOrder");
CREATE INDEX "imovel_fotos_tenantId_imovelId_idx" ON "imovel_fotos"("tenantId", "imovelId");

ALTER TABLE "imovel_fotos" ADD CONSTRAINT "imovel_fotos_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "imovel_fotos" ADD CONSTRAINT "imovel_fotos_imovelId_fkey" FOREIGN KEY ("imovelId") REFERENCES "imoveis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill capa a partir da foto única
INSERT INTO "imovel_fotos" ("id", "tenantId", "imovelId", "url", "publicId", "sortOrder", "createdAt")
SELECT gen_random_uuid()::text, "tenantId", "id", "fotoUrl", COALESCE("fotoPublicId", ''), 0, CURRENT_TIMESTAMP
FROM "imoveis"
WHERE "fotoUrl" IS NOT NULL AND "fotoUrl" <> '';
