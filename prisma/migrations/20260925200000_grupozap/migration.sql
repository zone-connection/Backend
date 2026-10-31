-- Conexão Grupo OLX (OLX, ZAP e Viva Real): feed de anúncios e leads.

CREATE TABLE "tenant_grupozap_connections" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "anuncianteId" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "displayAddress" TEXT NOT NULL DEFAULT 'Neighborhood',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_grupozap_connections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tenant_grupozap_connections_tenantId_key" ON "tenant_grupozap_connections"("tenantId");
CREATE UNIQUE INDEX "tenant_grupozap_connections_anuncianteId_key" ON "tenant_grupozap_connections"("anuncianteId");

ALTER TABLE "tenant_grupozap_connections"
ADD CONSTRAINT "tenant_grupozap_connections_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "grupozap_webhook_deliveries" (
    "id" TEXT NOT NULL,
    "originLeadId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grupozap_webhook_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "grupozap_webhook_deliveries_originLeadId_key" ON "grupozap_webhook_deliveries"("originLeadId");
CREATE INDEX "grupozap_webhook_deliveries_tenantId_idx" ON "grupozap_webhook_deliveries"("tenantId");

CREATE TABLE "lead_grupozap_links" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "originLeadId" TEXT NOT NULL,
    "originListingId" TEXT NOT NULL DEFAULT '',
    "clientListingId" TEXT NOT NULL DEFAULT '',
    "leadOrigin" TEXT NOT NULL,
    "leadType" TEXT NOT NULL DEFAULT '',
    "transactionType" TEXT NOT NULL DEFAULT '',
    "temperature" TEXT NOT NULL DEFAULT '',
    "message" TEXT NOT NULL DEFAULT '',
    "leadCerto" BOOLEAN NOT NULL DEFAULT false,
    "imovelId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_grupozap_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "lead_grupozap_links_leadId_key" ON "lead_grupozap_links"("leadId");
CREATE UNIQUE INDEX "lead_grupozap_links_originLeadId_key" ON "lead_grupozap_links"("originLeadId");
CREATE INDEX "lead_grupozap_links_imovelId_idx" ON "lead_grupozap_links"("imovelId");

ALTER TABLE "lead_grupozap_links"
ADD CONSTRAINT "lead_grupozap_links_leadId_fkey"
FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "grupozap_import_reports" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "company" TEXT NOT NULL DEFAULT '',
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grupozap_import_reports_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "grupozap_import_reports_externalId_key" ON "grupozap_import_reports"("externalId");

CREATE TABLE "grupozap_listing_issues" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "imovelId" TEXT NOT NULL,
    "reportExternalId" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grupozap_listing_issues_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "grupozap_listing_issues_tenantId_idx" ON "grupozap_listing_issues"("tenantId");
CREATE INDEX "grupozap_listing_issues_imovelId_idx" ON "grupozap_listing_issues"("imovelId");

ALTER TABLE "grupozap_listing_issues"
ADD CONSTRAINT "grupozap_listing_issues_imovelId_fkey"
FOREIGN KEY ("imovelId") REFERENCES "imoveis"("id") ON DELETE CASCADE ON UPDATE CASCADE;
