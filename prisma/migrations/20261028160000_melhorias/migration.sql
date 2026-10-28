CREATE TYPE "MelhoriaCategoria" AS ENUM ('funcionalidade_nova', 'melhoria_existente', 'usabilidade', 'integracao');
CREATE TYPE "MelhoriaPrioridade" AS ENUM ('baixa', 'normal', 'alta', 'urgente');
CREATE TYPE "MelhoriaStatus" AS ENUM ('recebida', 'em_avaliacao', 'aprovada', 'planejada', 'em_desenvolvimento', 'entregue', 'recusada', 'arquivada');

CREATE TABLE "melhoria_solicitacoes" (
  "id" TEXT NOT NULL,
  "codigo" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "titulo" TEXT NOT NULL,
  "descricao" TEXT NOT NULL,
  "categoria" "MelhoriaCategoria" NOT NULL,
  "prioridade" "MelhoriaPrioridade" NOT NULL DEFAULT 'normal',
  "status" "MelhoriaStatus" NOT NULL DEFAULT 'recebida',
  "responsavelId" TEXT,
  "justificativaDecisao" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "melhoria_solicitacoes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "melhoria_comentarios" (
  "id" TEXT NOT NULL,
  "solicitacaoId" TEXT NOT NULL,
  "autorId" TEXT,
  "texto" TEXT NOT NULL,
  "interna" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "melhoria_comentarios_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "melhoria_historicos" (
  "id" TEXT NOT NULL,
  "solicitacaoId" TEXT NOT NULL,
  "autorId" TEXT,
  "acao" TEXT NOT NULL,
  "detalhe" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "melhoria_historicos_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "melhoria_solicitacoes_codigo_key" ON "melhoria_solicitacoes"("codigo");
CREATE INDEX "melhoria_solicitacoes_tenantId_status_idx" ON "melhoria_solicitacoes"("tenantId", "status");
CREATE INDEX "melhoria_solicitacoes_responsavelId_idx" ON "melhoria_solicitacoes"("responsavelId");
CREATE INDEX "melhoria_solicitacoes_updatedAt_idx" ON "melhoria_solicitacoes"("updatedAt");
CREATE INDEX "melhoria_comentarios_solicitacaoId_createdAt_idx" ON "melhoria_comentarios"("solicitacaoId", "createdAt");
CREATE INDEX "melhoria_historicos_solicitacaoId_createdAt_idx" ON "melhoria_historicos"("solicitacaoId", "createdAt");

ALTER TABLE "melhoria_solicitacoes" ADD CONSTRAINT "melhoria_solicitacoes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "melhoria_solicitacoes" ADD CONSTRAINT "melhoria_solicitacoes_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "melhoria_comentarios" ADD CONSTRAINT "melhoria_comentarios_solicitacaoId_fkey" FOREIGN KEY ("solicitacaoId") REFERENCES "melhoria_solicitacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "melhoria_comentarios" ADD CONSTRAINT "melhoria_comentarios_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "melhoria_historicos" ADD CONSTRAINT "melhoria_historicos_solicitacaoId_fkey" FOREIGN KEY ("solicitacaoId") REFERENCES "melhoria_solicitacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "melhoria_historicos" ADD CONSTRAINT "melhoria_historicos_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
