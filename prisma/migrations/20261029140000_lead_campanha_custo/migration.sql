-- AlterTable
ALTER TABLE "lead_meta_links" ADD COLUMN "formName" TEXT,
ADD COLUMN "adName" TEXT,
ADD COLUMN "campaignId" TEXT,
ADD COLUMN "campaignName" TEXT,
ADD COLUMN "costPerLead" DECIMAL(12,2),
ADD COLUMN "costCurrency" TEXT DEFAULT 'BRL';
