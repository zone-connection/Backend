-- A ficha de documentação deixa de ser apagada junto com o lead do funil.
ALTER TABLE "documentacoes" DROP CONSTRAINT "documentacoes_leadId_fkey";

ALTER TABLE "documentacoes" ALTER COLUMN "leadId" DROP NOT NULL;

ALTER TABLE "documentacoes"
ADD CONSTRAINT "documentacoes_leadId_fkey"
FOREIGN KEY ("leadId") REFERENCES "leads"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
