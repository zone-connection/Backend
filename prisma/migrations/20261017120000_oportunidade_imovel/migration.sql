ALTER TABLE "oportunidades_captacao" ADD COLUMN "imovelId" TEXT;

CREATE UNIQUE INDEX "oportunidades_captacao_imovelId_key" ON "oportunidades_captacao"("imovelId");

ALTER TABLE "oportunidades_captacao" ADD CONSTRAINT "oportunidades_captacao_imovelId_fkey" FOREIGN KEY ("imovelId") REFERENCES "imoveis"("id") ON DELETE SET NULL ON UPDATE CASCADE;
