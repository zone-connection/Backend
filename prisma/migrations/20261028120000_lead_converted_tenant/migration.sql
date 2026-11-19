ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "convertedTenantId" TEXT;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "conversionSlug" TEXT;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "conversionLock" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "leads_convertedTenantId_key" ON "leads"("convertedTenantId");

DO $$ BEGIN
  ALTER TABLE "leads" ADD CONSTRAINT "leads_convertedTenantId_fkey" FOREIGN KEY ("convertedTenantId") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
