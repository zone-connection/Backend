ALTER TABLE "documentacoes" ADD COLUMN "propostaId" TEXT;

CREATE INDEX "documentacoes_propostaId_idx" ON "documentacoes"("propostaId");

ALTER TABLE "documentacoes" ADD CONSTRAINT "documentacoes_propostaId_fkey" FOREIGN KEY ("propostaId") REFERENCES "propostas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
