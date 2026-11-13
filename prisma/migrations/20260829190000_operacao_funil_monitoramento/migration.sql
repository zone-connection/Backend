ALTER TABLE "captacoes"
ADD COLUMN "stageEnteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "lastStageChangeAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "lastMovementAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "lastHistoricoAt" TIMESTAMP(3),
ADD COLUMN "prazoDueAt" TIMESTAMP(3),
ADD COLUMN "alertaProximoAt" TIMESTAMP(3),
ADD COLUMN "prazoAdiado" BOOLEAN NOT NULL DEFAULT false;

UPDATE "captacoes"
SET "stageEnteredAt" = "createdAt",
    "lastStageChangeAt" = "createdAt",
    "lastMovementAt" = "updatedAt";

CREATE INDEX "captacoes_tenantId_lastMovementAt_idx" ON "captacoes"("tenantId", "lastMovementAt");
CREATE INDEX "captacoes_tenantId_prazoDueAt_idx" ON "captacoes"("tenantId", "prazoDueAt");

ALTER TABLE "vendas_usado"
ADD COLUMN "stageEnteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "lastStageChangeAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "lastMovementAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "lastHistoricoAt" TIMESTAMP(3),
ADD COLUMN "prazoDueAt" TIMESTAMP(3),
ADD COLUMN "alertaProximoAt" TIMESTAMP(3),
ADD COLUMN "prazoAdiado" BOOLEAN NOT NULL DEFAULT false;

UPDATE "vendas_usado"
SET "stageEnteredAt" = "createdAt",
    "lastStageChangeAt" = "createdAt",
    "lastMovementAt" = "updatedAt";

CREATE INDEX "vendas_usado_tenantId_lastMovementAt_idx" ON "vendas_usado"("tenantId", "lastMovementAt");
CREATE INDEX "vendas_usado_tenantId_prazoDueAt_idx" ON "vendas_usado"("tenantId", "prazoDueAt");
