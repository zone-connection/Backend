-- Dados financeiros/cadastro capturados no envio para análise.
ALTER TABLE "documentacoes"
  ADD COLUMN "temEntrada" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "valorEntrada" INTEGER,
  ADD COLUMN "temFgts" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "valorFgts" INTEGER,
  ADD COLUMN "temDependente" BOOLEAN NOT NULL DEFAULT false;
