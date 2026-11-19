CREATE TYPE "WhatsappConnectionStatus" AS ENUM ('disconnected', 'connecting', 'connected', 'error');
CREATE TYPE "WhatsappNotificationStatus" AS ENUM ('pending', 'sent', 'failed', 'skipped');

CREATE TABLE "whatsapp_connections" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "instanceName" TEXT NOT NULL,
    "phoneNumber" TEXT,
    "connectionStatus" "WhatsappConnectionStatus" NOT NULL DEFAULT 'disconnected',
    "notificationsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "connectedAt" TIMESTAMP(3),
    "disconnectedAt" TIMESTAMP(3),
    "lastConnectionCheck" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_connections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "whatsapp_notifications" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "notificationType" TEXT NOT NULL,
    "status" "WhatsappNotificationStatus" NOT NULL DEFAULT 'pending',
    "errorMessage" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_notifications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "whatsapp_connections_userId_key" ON "whatsapp_connections"("userId");
CREATE UNIQUE INDEX "whatsapp_connections_instanceName_key" ON "whatsapp_connections"("instanceName");
CREATE INDEX "whatsapp_connections_tenantId_idx" ON "whatsapp_connections"("tenantId");
CREATE UNIQUE INDEX "whatsapp_notifications_tenantId_userId_leadId_notificationType_key" ON "whatsapp_notifications"("tenantId", "userId", "leadId", "notificationType");
CREATE INDEX "whatsapp_notifications_status_attempts_idx" ON "whatsapp_notifications"("status", "attempts");
CREATE INDEX "whatsapp_notifications_tenantId_userId_idx" ON "whatsapp_notifications"("tenantId", "userId");

ALTER TABLE "whatsapp_connections" ADD CONSTRAINT "whatsapp_connections_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "whatsapp_connections" ADD CONSTRAINT "whatsapp_connections_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "whatsapp_notifications" ADD CONSTRAINT "whatsapp_notifications_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "whatsapp_notifications" ADD CONSTRAINT "whatsapp_notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "whatsapp_notifications" ADD CONSTRAINT "whatsapp_notifications_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
