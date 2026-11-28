ALTER TABLE "whatsapp_notifications" ALTER COLUMN "leadId" DROP NOT NULL;

ALTER TABLE "whatsapp_notifications" ADD COLUMN "agendamentoId" TEXT;

CREATE INDEX "whatsapp_notifications_tenantId_userId_agendamentoId_notificationType_idx" ON "whatsapp_notifications"("tenantId", "userId", "agendamentoId", "notificationType");

CREATE UNIQUE INDEX "whatsapp_notifications_agenda_unica" ON "whatsapp_notifications"("tenantId", "userId", "agendamentoId", "notificationType") WHERE "agendamentoId" IS NOT NULL;

ALTER TABLE "whatsapp_notifications" ADD CONSTRAINT "whatsapp_notifications_agendamentoId_fkey" FOREIGN KEY ("agendamentoId") REFERENCES "agendamentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
