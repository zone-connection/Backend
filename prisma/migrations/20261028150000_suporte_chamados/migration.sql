DO $$ BEGIN
  CREATE TYPE "SuportePrioridade" AS ENUM ('baixa', 'normal', 'alta', 'urgente');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "SuporteStatus" AS ENUM ('aberto', 'em_atendimento', 'aguardando_cliente', 'aguardando_equipe', 'resolvido', 'fechado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "suporte_chamados" (
  "id" TEXT NOT NULL,
  "codigo" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "titulo" TEXT NOT NULL,
  "descricao" TEXT NOT NULL,
  "categoria" TEXT NOT NULL,
  "prioridade" "SuportePrioridade" NOT NULL DEFAULT 'normal',
  "status" "SuporteStatus" NOT NULL DEFAULT 'aberto',
  "responsavelId" TEXT,
  "prazoEm" TIMESTAMP(3),
  "resolvidoEm" TIMESTAMP(3),
  "fechadoEm" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "suporte_chamados_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "suporte_mensagens" (
  "id" TEXT NOT NULL,
  "chamadoId" TEXT NOT NULL,
  "autorId" TEXT,
  "texto" TEXT NOT NULL,
  "interna" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "suporte_mensagens_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "suporte_historicos" (
  "id" TEXT NOT NULL,
  "chamadoId" TEXT NOT NULL,
  "autorId" TEXT,
  "acao" TEXT NOT NULL,
  "detalhe" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "suporte_historicos_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "suporte_chamados_codigo_key" ON "suporte_chamados"("codigo");
CREATE INDEX IF NOT EXISTS "suporte_chamados_tenantId_status_idx" ON "suporte_chamados"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "suporte_chamados_responsavelId_idx" ON "suporte_chamados"("responsavelId");
CREATE INDEX IF NOT EXISTS "suporte_chamados_prazoEm_idx" ON "suporte_chamados"("prazoEm");
CREATE INDEX IF NOT EXISTS "suporte_mensagens_chamadoId_createdAt_idx" ON "suporte_mensagens"("chamadoId", "createdAt");
CREATE INDEX IF NOT EXISTS "suporte_historicos_chamadoId_createdAt_idx" ON "suporte_historicos"("chamadoId", "createdAt");

DO $$ BEGIN ALTER TABLE "suporte_chamados" ADD CONSTRAINT "suporte_chamados_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "suporte_chamados" ADD CONSTRAINT "suporte_chamados_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "suporte_mensagens" ADD CONSTRAINT "suporte_mensagens_chamadoId_fkey" FOREIGN KEY ("chamadoId") REFERENCES "suporte_chamados"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "suporte_mensagens" ADD CONSTRAINT "suporte_mensagens_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "suporte_historicos" ADD CONSTRAINT "suporte_historicos_chamadoId_fkey" FOREIGN KEY ("chamadoId") REFERENCES "suporte_chamados"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "suporte_historicos" ADD CONSTRAINT "suporte_historicos_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
