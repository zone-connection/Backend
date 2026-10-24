-- AlterTable
ALTER TABLE "tenant_meta_connections" ADD COLUMN "pageName" TEXT;
ALTER TABLE "tenant_meta_connections" ADD COLUMN "adAccountId" TEXT;
ALTER TABLE "tenant_meta_connections" ADD COLUMN "adAccountName" TEXT;
ALTER TABLE "tenant_meta_connections" ADD COLUMN "connectedByUserId" TEXT;
ALTER TABLE "tenant_meta_connections" ADD COLUMN "tokenExpiresAt" TIMESTAMP(3);
