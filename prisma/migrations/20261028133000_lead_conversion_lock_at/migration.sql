-- Permite identificar trava abandonada se o processo cair no meio da conversão.
ALTER TABLE "leads" ADD COLUMN "conversionLockedAt" TIMESTAMP(3);
ALTER TABLE "leads" ADD COLUMN "convertedAt" TIMESTAMP(3);
