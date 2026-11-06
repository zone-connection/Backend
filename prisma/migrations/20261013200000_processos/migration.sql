-- AlterEnum
ALTER TYPE "ArquivoVinculoTipo" ADD VALUE 'processo';

-- CreateEnum
CREATE TYPE "ProcessoStatus" AS ENUM ('rascunho', 'enviado', 'aprovado', 'reprovado');

-- CreateEnum
CREATE TYPE "ProcessoRetornoResultado" AS ENUM ('aprovado', 'reprovado');

-- CreateTable
CREATE TABLE "processos" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "autorId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "fonte" TEXT NOT NULL DEFAULT '',
    "telefone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "estadoCivil" TEXT NOT NULL DEFAULT '',
    "tipoRenda" TEXT NOT NULL DEFAULT '',
    "cotista" BOOLEAN NOT NULL DEFAULT false,
    "dependente" BOOLEAN NOT NULL DEFAULT false,
    "empreendimentoId" TEXT,
    "corretorId" TEXT,
    "gerenteId" TEXT,
    "status" "ProcessoStatus" NOT NULL DEFAULT 'rascunho',
    "enviadoAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "processos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processo_retornos" (
    "id" TEXT NOT NULL,
    "processoId" TEXT NOT NULL,
    "autorId" TEXT NOT NULL,
    "resultado" "ProcessoRetornoResultado" NOT NULL,
    "texto" TEXT NOT NULL DEFAULT '',
    "arquivoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processo_retornos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "processos_tenantId_status_idx" ON "processos"("tenantId", "status");
CREATE INDEX "processos_leadId_idx" ON "processos"("leadId");
CREATE INDEX "processos_autorId_idx" ON "processos"("autorId");
CREATE INDEX "processos_corretorId_idx" ON "processos"("corretorId");
CREATE INDEX "processo_retornos_processoId_idx" ON "processo_retornos"("processoId");

ALTER TABLE "processos" ADD CONSTRAINT "processos_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "processos" ADD CONSTRAINT "processos_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "processos" ADD CONSTRAINT "processos_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "processos" ADD CONSTRAINT "processos_empreendimentoId_fkey" FOREIGN KEY ("empreendimentoId") REFERENCES "empreendimentos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "processos" ADD CONSTRAINT "processos_corretorId_fkey" FOREIGN KEY ("corretorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "processos" ADD CONSTRAINT "processos_gerenteId_fkey" FOREIGN KEY ("gerenteId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "processo_retornos" ADD CONSTRAINT "processo_retornos_processoId_fkey" FOREIGN KEY ("processoId") REFERENCES "processos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "processo_retornos" ADD CONSTRAINT "processo_retornos_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
