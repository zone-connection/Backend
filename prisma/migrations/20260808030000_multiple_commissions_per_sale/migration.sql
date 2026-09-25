-- Uma venda pode gerar vários lançamentos de comissão.
DROP INDEX IF EXISTS "financeiro_comissoes_documentacaoId_key";

CREATE INDEX IF NOT EXISTS "financeiro_comissoes_documentacaoId_idx"
  ON "financeiro_comissoes"("documentacaoId");
