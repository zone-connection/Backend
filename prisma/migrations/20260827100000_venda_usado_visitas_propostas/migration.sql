-- Visitas, feedback, propostas e negociação da venda de usados (não reutiliza Agenda/Proposta comercial).

ALTER TYPE "VendaUsadoHistoricoTipo" ADD VALUE IF NOT EXISTS 'visita';
ALTER TYPE "VendaUsadoHistoricoTipo" ADD VALUE IF NOT EXISTS 'visita_feedback';
ALTER TYPE "VendaUsadoHistoricoTipo" ADD VALUE IF NOT EXISTS 'proposta';
ALTER TYPE "VendaUsadoHistoricoTipo" ADD VALUE IF NOT EXISTS 'negociacao';

CREATE TYPE "VendaUsadoVisitaStatus" AS ENUM ('agendada', 'confirmada', 'realizada', 'cancelada', 'nao_compareceu');
CREATE TYPE "VendaUsadoVisitaInteresse" AS ENUM ('muito_interessado', 'interessado', 'pouco_interessado', 'sem_interesse');
CREATE TYPE "VendaUsadoPropostaStatus" AS ENUM ('rascunho', 'enviada', 'em_analise', 'aceita', 'recusada', 'cancelada');
CREATE TYPE "VendaUsadoNegociacaoStatus" AS ENUM ('aberta', 'em_negociacao', 'aceita', 'recusada', 'encerrada');
CREATE TYPE "VendaUsadoNegociacaoOrigem" AS ENUM ('interessado', 'proprietario', 'corretor', 'outro');

CREATE TABLE "venda_usado_visitas" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "vendaUsadoId" TEXT NOT NULL,
  "interessadoId" TEXT NOT NULL,
  "responsavelId" TEXT NOT NULL,
  "dataHora" TIMESTAMP(3) NOT NULL,
  "status" "VendaUsadoVisitaStatus" NOT NULL DEFAULT 'agendada',
  "observacoes" TEXT NOT NULL DEFAULT '',
  "feedbackAvaliacao" INTEGER,
  "feedbackInteresse" "VendaUsadoVisitaInteresse",
  "feedbackComentarios" TEXT NOT NULL DEFAULT '',
  "feedbackObservacoes" TEXT NOT NULL DEFAULT '',
  "feedbackAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "venda_usado_visitas_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "venda_usado_propostas" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "vendaUsadoId" TEXT NOT NULL,
  "interessadoId" TEXT NOT NULL,
  "responsavelId" TEXT NOT NULL,
  "valor" DECIMAL(14,2) NOT NULL,
  "entrada" DECIMAL(14,2),
  "valorFinanciamento" DECIMAL(14,2),
  "observacoes" TEXT NOT NULL DEFAULT '',
  "status" "VendaUsadoPropostaStatus" NOT NULL DEFAULT 'rascunho',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "venda_usado_propostas_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "venda_usado_negociacoes" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "propostaId" TEXT NOT NULL,
  "status" "VendaUsadoNegociacaoStatus" NOT NULL DEFAULT 'aberta',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "venda_usado_negociacoes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "venda_usado_negociacao_movimentos" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "negociacaoId" TEXT NOT NULL,
  "valor" DECIMAL(14,2) NOT NULL,
  "entrada" DECIMAL(14,2),
  "valorFinanciamento" DECIMAL(14,2),
  "observacoes" TEXT NOT NULL DEFAULT '',
  "origem" "VendaUsadoNegociacaoOrigem" NOT NULL DEFAULT 'corretor',
  "responsavelId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "venda_usado_negociacao_movimentos_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "venda_usado_negociacoes_propostaId_key" ON "venda_usado_negociacoes"("propostaId");
CREATE INDEX "venda_usado_visitas_tenantId_vendaUsadoId_idx" ON "venda_usado_visitas"("tenantId", "vendaUsadoId");
CREATE INDEX "venda_usado_visitas_tenantId_dataHora_idx" ON "venda_usado_visitas"("tenantId", "dataHora");
CREATE INDEX "venda_usado_propostas_tenantId_vendaUsadoId_idx" ON "venda_usado_propostas"("tenantId", "vendaUsadoId");
CREATE INDEX "venda_usado_propostas_tenantId_status_idx" ON "venda_usado_propostas"("tenantId", "status");
CREATE INDEX "venda_usado_negociacoes_tenantId_idx" ON "venda_usado_negociacoes"("tenantId");
CREATE INDEX "venda_usado_negociacao_movimentos_tenantId_negociacaoId_idx" ON "venda_usado_negociacao_movimentos"("tenantId", "negociacaoId");
CREATE INDEX "venda_usado_negociacao_movimentos_negociacaoId_createdAt_idx" ON "venda_usado_negociacao_movimentos"("negociacaoId", "createdAt");

ALTER TABLE "venda_usado_visitas" ADD CONSTRAINT "venda_usado_visitas_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "venda_usado_visitas" ADD CONSTRAINT "venda_usado_visitas_vendaUsadoId_fkey" FOREIGN KEY ("vendaUsadoId") REFERENCES "vendas_usado"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "venda_usado_visitas" ADD CONSTRAINT "venda_usado_visitas_interessadoId_fkey" FOREIGN KEY ("interessadoId") REFERENCES "interessados_usado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "venda_usado_visitas" ADD CONSTRAINT "venda_usado_visitas_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "venda_usado_propostas" ADD CONSTRAINT "venda_usado_propostas_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "venda_usado_propostas" ADD CONSTRAINT "venda_usado_propostas_vendaUsadoId_fkey" FOREIGN KEY ("vendaUsadoId") REFERENCES "vendas_usado"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "venda_usado_propostas" ADD CONSTRAINT "venda_usado_propostas_interessadoId_fkey" FOREIGN KEY ("interessadoId") REFERENCES "interessados_usado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "venda_usado_propostas" ADD CONSTRAINT "venda_usado_propostas_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "venda_usado_negociacoes" ADD CONSTRAINT "venda_usado_negociacoes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "venda_usado_negociacoes" ADD CONSTRAINT "venda_usado_negociacoes_propostaId_fkey" FOREIGN KEY ("propostaId") REFERENCES "venda_usado_propostas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "venda_usado_negociacao_movimentos" ADD CONSTRAINT "venda_usado_negociacao_movimentos_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "venda_usado_negociacao_movimentos" ADD CONSTRAINT "venda_usado_negociacao_movimentos_negociacaoId_fkey" FOREIGN KEY ("negociacaoId") REFERENCES "venda_usado_negociacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "venda_usado_negociacao_movimentos" ADD CONSTRAINT "venda_usado_negociacao_movimentos_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
