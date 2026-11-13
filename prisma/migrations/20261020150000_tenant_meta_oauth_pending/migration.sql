-- CreateTable
CREATE TABLE "tenant_meta_oauth_pending" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userAccessToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_meta_oauth_pending_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenant_meta_oauth_pending_tenantId_userId_key" ON "tenant_meta_oauth_pending"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "tenant_meta_oauth_pending_expiresAt_idx" ON "tenant_meta_oauth_pending"("expiresAt");

-- AddForeignKey
ALTER TABLE "tenant_meta_oauth_pending" ADD CONSTRAINT "tenant_meta_oauth_pending_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
