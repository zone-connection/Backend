ALTER TABLE "tenants" ADD COLUMN "tarefasEnabled" BOOLEAN NOT NULL DEFAULT false;

CREATE TYPE "TarefaPrioridade" AS ENUM ('alta', 'media', 'baixa');
CREATE TYPE "TarefaStatus" AS ENUM ('aberta', 'concluida');
CREATE TYPE "TarefaRecorrencia" AS ENUM ('nenhuma', 'diaria', 'semanal', 'mensal', 'dias_especificos', 'personalizado');
CREATE TYPE "TarefaLembreteCanal" AS ENUM ('email');
CREATE TYPE "TarefaLembrete" AS ENUM ('nenhum', 'no_horario', 'min_5', 'min_15', 'min_30', 'hora_1', 'dia_1', 'personalizado');

CREATE TABLE "tarefas" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL DEFAULT '',
    "data" TEXT NOT NULL,
    "horario" TEXT,
    "venceEm" TIMESTAMP(3) NOT NULL,
    "prioridade" "TarefaPrioridade" NOT NULL DEFAULT 'media',
    "status" "TarefaStatus" NOT NULL DEFAULT 'aberta',
    "responsavelId" TEXT NOT NULL,
    "criadoPorId" TEXT NOT NULL,
    "leadId" TEXT,
    "agendamentoId" TEXT,
    "imovelId" TEXT,
    "recorrencia" "TarefaRecorrencia" NOT NULL DEFAULT 'nenhuma',
    "diasSemana" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "intervaloDias" INTEGER,
    "lembrete" "TarefaLembrete" NOT NULL DEFAULT 'nenhum',
    "lembreteMinutos" INTEGER,
    "lembreteCanal" "TarefaLembreteCanal" NOT NULL DEFAULT 'email',
    "lembreteEm" TIMESTAMP(3),
    "lembreteEnviadoEm" TIMESTAMP(3),
    "atrasoEnviadoEm" TIMESTAMP(3),
    "serieId" TEXT,
    "concluidaEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tarefas_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tarefa_comentarios" (
    "id" TEXT NOT NULL,
    "tarefaId" TEXT NOT NULL,
    "autorId" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tarefa_comentarios_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "tarefas_tenantId_status_venceEm_idx" ON "tarefas"("tenantId", "status", "venceEm");
CREATE INDEX "tarefas_tenantId_responsavelId_idx" ON "tarefas"("tenantId", "responsavelId");
CREATE INDEX "tarefas_leadId_idx" ON "tarefas"("leadId");
CREATE INDEX "tarefas_agendamentoId_idx" ON "tarefas"("agendamentoId");
CREATE INDEX "tarefas_imovelId_idx" ON "tarefas"("imovelId");
CREATE INDEX "tarefas_lembreteEm_idx" ON "tarefas"("lembreteEm");
CREATE INDEX "tarefa_comentarios_tarefaId_idx" ON "tarefa_comentarios"("tarefaId");

ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_agendamentoId_fkey" FOREIGN KEY ("agendamentoId") REFERENCES "agendamentos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_imovelId_fkey" FOREIGN KEY ("imovelId") REFERENCES "imoveis"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tarefa_comentarios" ADD CONSTRAINT "tarefa_comentarios_tarefaId_fkey" FOREIGN KEY ("tarefaId") REFERENCES "tarefas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tarefa_comentarios" ADD CONSTRAINT "tarefa_comentarios_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
