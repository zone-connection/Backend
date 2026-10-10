-- CreateEnum
CREATE TYPE "InteresseEmpreendimentoStatus" AS ENUM ('ativo', 'pausado', 'convertido', 'descartado');

-- CreateTable
CREATE TABLE "lead_empreendimentos_interesse" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "empreendimentoId" TEXT NOT NULL,
    "status" "InteresseEmpreendimentoStatus" NOT NULL DEFAULT 'ativo',
    "observacoes" TEXT NOT NULL DEFAULT '',
    "corretorId" TEXT,
    "dataInteresse" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimaInteracao" TIMESTAMP(3),
    "removidoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lead_empreendimentos_interesse_pkey" PRIMARY KEY ("id")
);

INSERT INTO "lead_empreendimentos_interesse" (
  "id",
  "tenantId",
  "leadId",
  "empreendimentoId",
  "status",
  "observacoes",
  "corretorId",
  "dataInteresse",
  "ultimaInteracao",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid(),
  l."tenantId",
  l.id,
  l."empreendimentoId",
  'ativo',
  '',
  l."corretorId",
  COALESCE(l."createdAt", CURRENT_TIMESTAMP),
  l."updatedAt",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "leads" l
WHERE l."empreendimentoId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "lead_empreendimentos_interesse" i
    WHERE i."leadId" = l.id
      AND i."empreendimentoId" = l."empreendimentoId"
  );

CREATE UNIQUE INDEX "lead_empreendimentos_interesse_leadId_empreendimentoId_key"
  ON "lead_empreendimentos_interesse"("leadId", "empreendimentoId");

CREATE INDEX "lead_empreendimentos_interesse_tenantId_idx"
  ON "lead_empreendimentos_interesse"("tenantId");

CREATE INDEX "lead_empreendimentos_interesse_leadId_removidoEm_idx"
  ON "lead_empreendimentos_interesse"("leadId", "removidoEm");

CREATE INDEX "lead_empreendimentos_interesse_empreendimentoId_idx"
  ON "lead_empreendimentos_interesse"("empreendimentoId");

CREATE INDEX "lead_empreendimentos_interesse_corretorId_idx"
  ON "lead_empreendimentos_interesse"("corretorId");

ALTER TABLE "lead_empreendimentos_interesse"
  ADD CONSTRAINT "lead_empreendimentos_interesse_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "lead_empreendimentos_interesse"
  ADD CONSTRAINT "lead_empreendimentos_interesse_leadId_fkey"
  FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "lead_empreendimentos_interesse"
  ADD CONSTRAINT "lead_empreendimentos_interesse_empreendimentoId_fkey"
  FOREIGN KEY ("empreendimentoId") REFERENCES "empreendimentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "lead_empreendimentos_interesse"
  ADD CONSTRAINT "lead_empreendimentos_interesse_corretorId_fkey"
  FOREIGN KEY ("corretorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
