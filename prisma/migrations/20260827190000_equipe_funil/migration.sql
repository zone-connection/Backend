-- CreateTable
CREATE TABLE "equipe_funis" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "equipeId" TEXT NOT NULL,
    "funilId" TEXT NOT NULL,
    "tipo" "FunilTipo" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "equipe_funis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "equipe_funis_tenantId_equipeId_funilId_key" ON "equipe_funis"("tenantId", "equipeId", "funilId");

-- CreateIndex
CREATE UNIQUE INDEX "equipe_funis_equipeId_tipo_key" ON "equipe_funis"("equipeId", "tipo");

-- CreateIndex
CREATE INDEX "equipe_funis_tenantId_equipeId_idx" ON "equipe_funis"("tenantId", "equipeId");

-- CreateIndex
CREATE INDEX "equipe_funis_funilId_idx" ON "equipe_funis"("funilId");

-- AddForeignKey
ALTER TABLE "equipe_funis" ADD CONSTRAINT "equipe_funis_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipe_funis" ADD CONSTRAINT "equipe_funis_equipeId_fkey" FOREIGN KEY ("equipeId") REFERENCES "equipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipe_funis" ADD CONSTRAINT "equipe_funis_funilId_fkey" FOREIGN KEY ("funilId") REFERENCES "funis"("id") ON DELETE CASCADE ON UPDATE CASCADE;
