CREATE TYPE "MuralChaveStatus" AS ENUM ('disponivel', 'em_uso');
CREATE TYPE "MuralChaveLocal" AS ENUM ('proprietario', 'imobiliaria', 'corretor', 'outro');
CREATE TYPE "MuralChaveMovimentoTipo" AS ENUM (
  'cadastro',
  'edicao',
  'identificador',
  'retirada',
  'retirada_manual',
  'devolucao',
  'confirmacao'
);

ALTER TYPE "NotificacaoTipo" ADD VALUE IF NOT EXISTS 'chave_retirada';
ALTER TYPE "NotificacaoTipo" ADD VALUE IF NOT EXISTS 'chave_devolucao';
ALTER TYPE "NotificacaoTipo" ADD VALUE IF NOT EXISTS 'chave_confirmacao';

CREATE TABLE "mural_chaves" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "identificador" TEXT NOT NULL,
  "identificadorNorm" TEXT NOT NULL,
  "imovelId" TEXT,
  "empreendimentoId" TEXT,
  "unidade" TEXT NOT NULL DEFAULT '',
  "status" "MuralChaveStatus" NOT NULL DEFAULT 'disponivel',
  "local" "MuralChaveLocal" NOT NULL DEFAULT 'imobiliaria',
  "localDescricao" TEXT NOT NULL DEFAULT '',
  "responsavelAtualId" TEXT,
  "retiradaEm" TIMESTAMP(3),
  "previsaoDevolucao" TIMESTAMP(3),
  "retiradoPorId" TEXT,
  "retiradaRegistradaPorId" TEXT,
  "observacoes" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "mural_chaves_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "mural_chave_movimentos" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "chaveId" TEXT NOT NULL,
  "tipo" "MuralChaveMovimentoTipo" NOT NULL,
  "manual" BOOLEAN NOT NULL DEFAULT false,
  "identificador" TEXT NOT NULL,
  "identificadorAnterior" TEXT NOT NULL DEFAULT '',
  "imovelId" TEXT,
  "empreendimentoId" TEXT,
  "unidade" TEXT NOT NULL DEFAULT '',
  "empreendimentoNome" TEXT NOT NULL DEFAULT '',
  "imovelLabel" TEXT NOT NULL DEFAULT '',
  "quemRetirouId" TEXT,
  "quemRetirouNome" TEXT NOT NULL DEFAULT '',
  "quemRegistrouRetiradaId" TEXT,
  "quemRegistrouRetiradaNome" TEXT NOT NULL DEFAULT '',
  "retiradaEm" TIMESTAMP(3),
  "previsaoDevolucao" TIMESTAMP(3),
  "quemDevolveuId" TEXT,
  "quemDevolveuNome" TEXT NOT NULL DEFAULT '',
  "quemRecebeuDevolucaoId" TEXT,
  "quemRecebeuDevolucaoNome" TEXT NOT NULL DEFAULT '',
  "devolucaoEm" TIMESTAMP(3),
  "confirmacaoPendente" BOOLEAN NOT NULL DEFAULT false,
  "confirmadoEm" TIMESTAMP(3),
  "confirmadoParaId" TEXT,
  "confirmadoParaNome" TEXT NOT NULL DEFAULT '',
  "autorId" TEXT NOT NULL,
  "autorNome" TEXT NOT NULL,
  "observacao" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mural_chave_movimentos_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "mural_chaves_tenantId_identificadorNorm_key" ON "mural_chaves"("tenantId", "identificadorNorm");
CREATE INDEX "mural_chaves_tenantId_status_idx" ON "mural_chaves"("tenantId", "status");
CREATE INDEX "mural_chaves_tenantId_empreendimentoId_idx" ON "mural_chaves"("tenantId", "empreendimentoId");
CREATE INDEX "mural_chaves_tenantId_imovelId_idx" ON "mural_chaves"("tenantId", "imovelId");
CREATE INDEX "mural_chave_movimentos_tenantId_chaveId_createdAt_idx" ON "mural_chave_movimentos"("tenantId", "chaveId", "createdAt");
CREATE INDEX "mural_chave_movimentos_quemDevolveuId_confirmacaoPendente_idx" ON "mural_chave_movimentos"("quemDevolveuId", "confirmacaoPendente");

ALTER TABLE "mural_chaves" ADD CONSTRAINT "mural_chaves_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mural_chaves" ADD CONSTRAINT "mural_chaves_imovelId_fkey" FOREIGN KEY ("imovelId") REFERENCES "imoveis"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "mural_chaves" ADD CONSTRAINT "mural_chaves_empreendimentoId_fkey" FOREIGN KEY ("empreendimentoId") REFERENCES "empreendimentos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "mural_chaves" ADD CONSTRAINT "mural_chaves_responsavelAtualId_fkey" FOREIGN KEY ("responsavelAtualId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "mural_chaves" ADD CONSTRAINT "mural_chaves_retiradoPorId_fkey" FOREIGN KEY ("retiradoPorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "mural_chaves" ADD CONSTRAINT "mural_chaves_retiradaRegistradaPorId_fkey" FOREIGN KEY ("retiradaRegistradaPorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "mural_chave_movimentos" ADD CONSTRAINT "mural_chave_movimentos_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mural_chave_movimentos" ADD CONSTRAINT "mural_chave_movimentos_chaveId_fkey" FOREIGN KEY ("chaveId") REFERENCES "mural_chaves"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mural_chave_movimentos" ADD CONSTRAINT "mural_chave_movimentos_quemRetirouId_fkey" FOREIGN KEY ("quemRetirouId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "mural_chave_movimentos" ADD CONSTRAINT "mural_chave_movimentos_quemRegistrouRetiradaId_fkey" FOREIGN KEY ("quemRegistrouRetiradaId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "mural_chave_movimentos" ADD CONSTRAINT "mural_chave_movimentos_quemDevolveuId_fkey" FOREIGN KEY ("quemDevolveuId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "mural_chave_movimentos" ADD CONSTRAINT "mural_chave_movimentos_quemRecebeuDevolucaoId_fkey" FOREIGN KEY ("quemRecebeuDevolucaoId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "mural_chave_movimentos" ADD CONSTRAINT "mural_chave_movimentos_confirmadoParaId_fkey" FOREIGN KEY ("confirmadoParaId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "mural_chave_movimentos" ADD CONSTRAINT "mural_chave_movimentos_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
