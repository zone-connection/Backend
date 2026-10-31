-- Comissão de cliente ainda não cadastrado não cria venda em Documentação.
ALTER TABLE "financeiro_comissoes" ALTER COLUMN "documentacaoId" DROP NOT NULL;
