-- Acesso autenticado do Portal do Proprietário (1:1 com proprietarios).

CREATE TYPE "ProprietarioPortalStatus" AS ENUM ('ativo', 'inativo');

CREATE TABLE "proprietario_portal_acessos" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "proprietarioId" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "hashedRefreshToken" TEXT,
    "status" "ProprietarioPortalStatus" NOT NULL DEFAULT 'inativo',
    "lastLoginAt" TIMESTAMP(3),
    "passwordResetToken" TEXT,
    "passwordResetExpires" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proprietario_portal_acessos_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "proprietario_portal_acessos_proprietarioId_key" ON "proprietario_portal_acessos"("proprietarioId");
CREATE INDEX "proprietario_portal_acessos_tenantId_idx" ON "proprietario_portal_acessos"("tenantId");
CREATE INDEX "proprietario_portal_acessos_tenantId_status_idx" ON "proprietario_portal_acessos"("tenantId", "status");

ALTER TABLE "proprietario_portal_acessos"
  ADD CONSTRAINT "proprietario_portal_acessos_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "proprietario_portal_acessos"
  ADD CONSTRAINT "proprietario_portal_acessos_proprietarioId_fkey"
  FOREIGN KEY ("proprietarioId") REFERENCES "proprietarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
