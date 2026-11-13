DROP INDEX IF EXISTS "whatsapp_notifications_tenantId_userId_leadId_notificationType_key";
CREATE INDEX IF NOT EXISTS "whatsapp_notifications_tenantId_userId_leadId_idx" ON "whatsapp_notifications"("tenantId", "userId", "leadId");
