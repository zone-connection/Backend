ALTER TABLE "tenant_ozap_connections"
  ADD COLUMN IF NOT EXISTS "ozapApiKey" TEXT;
