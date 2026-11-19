ALTER TABLE "tarefas" ADD COLUMN "empreendimentoId" TEXT;

ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_empreendimentoId_fkey" FOREIGN KEY ("empreendimentoId") REFERENCES "empreendimentos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "tarefas_empreendimentoId_idx" ON "tarefas"("empreendimentoId");
