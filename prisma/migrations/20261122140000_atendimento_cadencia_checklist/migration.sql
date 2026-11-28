ALTER TABLE "tenants"
  ADD COLUMN IF NOT EXISTS "cadenciaAtiva" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "checklistAtivo" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "cadencia_etapas" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "ordem" INTEGER NOT NULL,
  "dia" INTEGER NOT NULL,
  "acao" TEXT NOT NULL,
  "descricao" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "cadencia_etapas_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "cadencia_execucoes" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "etapaId" TEXT,
  "dia" INTEGER NOT NULL,
  "acao" TEXT NOT NULL,
  "descricao" TEXT NOT NULL DEFAULT '',
  "concluidaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "autorId" TEXT NOT NULL,
  CONSTRAINT "cadencia_execucoes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "checklist_modelos" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "funilId" TEXT,
  "ordem" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "checklist_modelos_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "checklist_itens" (
  "id" TEXT NOT NULL,
  "modeloId" TEXT NOT NULL,
  "ordem" INTEGER NOT NULL,
  "texto" TEXT NOT NULL,
  "obrigatorio" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "checklist_itens_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "checklist_marcacoes" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "itemId" TEXT,
  "texto" TEXT NOT NULL,
  "obrigatorio" BOOLEAN NOT NULL,
  "concluidaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "autorId" TEXT NOT NULL,
  CONSTRAINT "checklist_marcacoes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "cadencia_etapas_tenantId_ordem_idx" ON "cadencia_etapas"("tenantId", "ordem");
CREATE INDEX IF NOT EXISTS "cadencia_execucoes_tenantId_leadId_idx" ON "cadencia_execucoes"("tenantId", "leadId");
CREATE INDEX IF NOT EXISTS "cadencia_execucoes_etapaId_idx" ON "cadencia_execucoes"("etapaId");
CREATE INDEX IF NOT EXISTS "checklist_modelos_tenantId_ordem_idx" ON "checklist_modelos"("tenantId", "ordem");
CREATE INDEX IF NOT EXISTS "checklist_itens_modeloId_ordem_idx" ON "checklist_itens"("modeloId", "ordem");
CREATE INDEX IF NOT EXISTS "checklist_marcacoes_tenantId_leadId_idx" ON "checklist_marcacoes"("tenantId", "leadId");
CREATE INDEX IF NOT EXISTS "checklist_marcacoes_itemId_idx" ON "checklist_marcacoes"("itemId");

DO $$ BEGIN
  ALTER TABLE "cadencia_etapas" ADD CONSTRAINT "cadencia_etapas_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "cadencia_execucoes" ADD CONSTRAINT "cadencia_execucoes_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "cadencia_execucoes" ADD CONSTRAINT "cadencia_execucoes_etapaId_fkey" FOREIGN KEY ("etapaId") REFERENCES "cadencia_etapas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "cadencia_execucoes" ADD CONSTRAINT "cadencia_execucoes_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "checklist_modelos" ADD CONSTRAINT "checklist_modelos_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "checklist_modelos" ADD CONSTRAINT "checklist_modelos_funilId_fkey" FOREIGN KEY ("funilId") REFERENCES "funis"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "checklist_itens" ADD CONSTRAINT "checklist_itens_modeloId_fkey" FOREIGN KEY ("modeloId") REFERENCES "checklist_modelos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "checklist_marcacoes" ADD CONSTRAINT "checklist_marcacoes_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "checklist_marcacoes" ADD CONSTRAINT "checklist_marcacoes_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "checklist_itens"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "checklist_marcacoes" ADD CONSTRAINT "checklist_marcacoes_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
