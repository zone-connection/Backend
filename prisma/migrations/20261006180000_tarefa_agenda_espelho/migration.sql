ALTER TABLE "agendamentos" ADD COLUMN "origemTarefa" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "tarefas" ADD COLUMN "agendaEventoId" TEXT;

CREATE UNIQUE INDEX "tarefas_agendaEventoId_key" ON "tarefas"("agendaEventoId");

ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_agendaEventoId_fkey" FOREIGN KEY ("agendaEventoId") REFERENCES "agendamentos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
