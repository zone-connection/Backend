-- Vínculo único entre o lead comercial da plataforma e o cliente criado na conversão.
ALTER TABLE "leads" ADD COLUMN "convertedTenantId" TEXT;
ALTER TABLE "leads" ADD COLUMN "conversionSlug" TEXT;
ALTER TABLE "leads" ADD COLUMN "conversionLock" TEXT;

CREATE UNIQUE INDEX "leads_convertedTenantId_key" ON "leads"("convertedTenantId");

ALTER TABLE "leads" ADD CONSTRAINT "leads_convertedTenantId_fkey" FOREIGN KEY ("convertedTenantId") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
