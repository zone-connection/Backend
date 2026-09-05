-- CreateEnum
CREATE TYPE "PrazoUnidade" AS ENUM ('minutos', 'horas', 'dias');

-- AlterEnum
ALTER TYPE "NotificacaoTipo" ADD VALUE 'lead_prazo_proximo';
ALTER TYPE "NotificacaoTipo" ADD VALUE 'lead_prazo_ultrapassado';

-- AlterTable funis
ALTER TABLE "funis"
  ADD COLUMN "inatividadeValor" INTEGER NOT NULL DEFAULT 48,
  ADD COLUMN "inatividadeUnidade" "PrazoUnidade" NOT NULL DEFAULT 'horas';

-- AlterTable funil_etapas
ALTER TABLE "funil_etapas"
  ADD COLUMN "prazoValor" INTEGER,
  ADD COLUMN "prazoUnidade" "PrazoUnidade" NOT NULL DEFAULT 'horas',
  ADD COLUMN "alertaAntecedenciaPercent" INTEGER NOT NULL DEFAULT 20;

-- AlterTable leads
ALTER TABLE "leads"
  ADD COLUMN "stageEnteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "lastMovementAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "lastStageChangeAt" TIMESTAMP(3),
  ADD COLUMN "lastTriagemAt" TIMESTAMP(3),
  ADD COLUMN "lastTarefaAt" TIMESTAMP(3),
  ADD COLUMN "lastAtividadeAt" TIMESTAMP(3),
  ADD COLUMN "prazoDueAt" TIMESTAMP(3),
  ADD COLUMN "alertaProximoAt" TIMESTAMP(3),
  ADD COLUMN "prazoAdiado" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable notificacoes
ALTER TABLE "notificacoes" ADD COLUMN "eventoChave" TEXT;

-- CreateTable
CREATE TABLE "lead_prazo_adiamentos" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "autorId" TEXT NOT NULL,
    "prazoAnteriorAt" TIMESTAMP(3),
    "prazoNovoAt" TIMESTAMP(3) NOT NULL,
    "prazoAnteriorValor" INTEGER,
    "prazoAnteriorUnidade" "PrazoUnidade",
    "prazoNovoValor" INTEGER NOT NULL,
    "prazoNovoUnidade" "PrazoUnidade" NOT NULL,
    "motivo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_prazo_adiamentos_pkey" PRIMARY KEY ("id")
);

-- Backfill: entrada na etapa atual a partir do último evento de triagem da etapa, senão createdAt.
UPDATE "leads" AS l
SET "stageEnteredAt" = COALESCE(
  (
    SELECT MAX(t."createdAt")
    FROM "triagem_events" t
    WHERE t."leadId" = l."id" AND t."stageNovo" = l."stage"
  ),
  l."createdAt"
);

UPDATE "leads" AS l
SET "lastStageChangeAt" = l."stageEnteredAt";

UPDATE "leads" AS l
SET "lastTriagemAt" = (
  SELECT MAX(t."createdAt") FROM "triagem_events" t WHERE t."leadId" = l."id"
);

UPDATE "leads" AS l
SET "lastTarefaAt" = (
  SELECT MAX(a."createdAt")
  FROM "agendamentos" a
  WHERE a."leadId" = l."id" AND a."tipo" = 'tarefa'
);

UPDATE "leads" AS l
SET "lastAtividadeAt" = (
  SELECT MAX(a."createdAt")
  FROM "agendamentos" a
  WHERE a."leadId" = l."id"
    AND a."tipo" <> 'tarefa'
    AND a."tipo" <> 'bloqueio'
);

UPDATE "leads" AS l
SET "lastMovementAt" = GREATEST(
  l."createdAt",
  COALESCE(l."lastStageChangeAt", l."createdAt"),
  COALESCE(l."lastTriagemAt", l."createdAt"),
  COALESCE(l."lastTarefaAt", l."createdAt"),
  COALESCE(l."lastAtividadeAt", l."createdAt")
);

-- CreateIndex
CREATE INDEX "leads_tenantId_lastMovementAt_idx" ON "leads"("tenantId", "lastMovementAt");
CREATE INDEX "leads_tenantId_prazoDueAt_idx" ON "leads"("tenantId", "prazoDueAt");
CREATE INDEX "leads_tenantId_alertaProximoAt_idx" ON "leads"("tenantId", "alertaProximoAt");
CREATE INDEX "notificacoes_userId_leadId_tipo_eventoChave_idx" ON "notificacoes"("userId", "leadId", "tipo", "eventoChave");
CREATE INDEX "lead_prazo_adiamentos_leadId_createdAt_idx" ON "lead_prazo_adiamentos"("leadId", "createdAt");
CREATE INDEX "lead_prazo_adiamentos_tenantId_idx" ON "lead_prazo_adiamentos"("tenantId");
CREATE INDEX "lead_prazo_adiamentos_autorId_idx" ON "lead_prazo_adiamentos"("autorId");

-- AddForeignKey
ALTER TABLE "lead_prazo_adiamentos" ADD CONSTRAINT "lead_prazo_adiamentos_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lead_prazo_adiamentos" ADD CONSTRAINT "lead_prazo_adiamentos_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lead_prazo_adiamentos" ADD CONSTRAINT "lead_prazo_adiamentos_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
