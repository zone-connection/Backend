CREATE TYPE "LeadFilaEventoTipo" AS ENUM (
  'atribuicao',
  'sem_participante',
  'ativar',
  'pausar',
  'membro_add',
  'membro_remove',
  'membro_ativar',
  'membro_desativar',
  'reordenar'
);

ALTER TABLE "leads" ADD COLUMN "filaDistribuidoAt" TIMESTAMP(3);

CREATE TABLE "lead_fila_configs" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "ativa" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "lead_fila_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "lead_fila_configs_tenantId_key" ON "lead_fila_configs"("tenantId");

ALTER TABLE "lead_fila_configs"
  ADD CONSTRAINT "lead_fila_configs_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "lead_fila_membros" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "configId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "ordem" INTEGER NOT NULL,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "ultimaAtribuicaoAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "lead_fila_membros_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "lead_fila_membros_configId_userId_key" ON "lead_fila_membros"("configId", "userId");
CREATE INDEX "lead_fila_membros_configId_ordem_idx" ON "lead_fila_membros"("configId", "ordem");
CREATE INDEX "lead_fila_membros_tenantId_idx" ON "lead_fila_membros"("tenantId");

ALTER TABLE "lead_fila_membros"
  ADD CONSTRAINT "lead_fila_membros_configId_fkey"
  FOREIGN KEY ("configId") REFERENCES "lead_fila_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lead_fila_membros"
  ADD CONSTRAINT "lead_fila_membros_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "lead_fila_eventos" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "configId" TEXT NOT NULL,
  "tipo" "LeadFilaEventoTipo" NOT NULL,
  "leadId" TEXT,
  "userId" TEXT,
  "actorId" TEXT,
  "origem" TEXT,
  "detalhe" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "lead_fila_eventos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "lead_fila_eventos_tenantId_createdAt_idx" ON "lead_fila_eventos"("tenantId", "createdAt");
CREATE INDEX "lead_fila_eventos_configId_createdAt_idx" ON "lead_fila_eventos"("configId", "createdAt");

ALTER TABLE "lead_fila_eventos"
  ADD CONSTRAINT "lead_fila_eventos_configId_fkey"
  FOREIGN KEY ("configId") REFERENCES "lead_fila_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
