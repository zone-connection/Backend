-- CreateTable
CREATE TABLE "tenant_orulo_connections" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientSecret" TEXT NOT NULL,
    "accessToken" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "lastFullSyncAt" TIMESTAMP(3),
    "lastReconcileAt" TIMESTAMP(3),
    "lastError" TEXT,
    "syncing" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_orulo_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_orulo_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_orulo_tokens_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "empreendimentos" ADD COLUMN "oruloBuildingId" INTEGER,
ADD COLUMN "oruloImageIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "oruloFloorPlanIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "oruloStatus" TEXT,
ADD COLUMN "oruloSyncedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "tenant_orulo_connections_clientId_key" ON "tenant_orulo_connections"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_orulo_connections_tenantId_key" ON "tenant_orulo_connections"("tenantId");

-- CreateIndex
CREATE INDEX "tenant_orulo_connections_tenantId_idx" ON "tenant_orulo_connections"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "user_orulo_tokens_userId_key" ON "user_orulo_tokens"("userId");

-- CreateIndex
CREATE INDEX "user_orulo_tokens_tenantId_idx" ON "user_orulo_tokens"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "empreendimentos_tenantId_oruloBuildingId_key" ON "empreendimentos"("tenantId", "oruloBuildingId");

-- CreateIndex
CREATE INDEX "empreendimentos_oruloBuildingId_idx" ON "empreendimentos"("oruloBuildingId");

-- AddForeignKey
ALTER TABLE "tenant_orulo_connections" ADD CONSTRAINT "tenant_orulo_connections_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_orulo_tokens" ADD CONSTRAINT "user_orulo_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
