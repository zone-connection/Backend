ALTER TABLE "agendamentos" ADD COLUMN "imovelId" TEXT;
ALTER TABLE "agendamentos" ADD COLUMN "toleranciaAtiva" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "agendamentos" ADD COLUMN "bloqueadoAte" TIMESTAMP(3);

ALTER TABLE "agendamentos"
ADD CONSTRAINT "agendamentos_imovelId_fkey"
FOREIGN KEY ("imovelId") REFERENCES "imoveis"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "agendamentos_imovelId_idx" ON "agendamentos"("imovelId");

CREATE TYPE "AgendamentoHistoricoAcao" AS ENUM ('criado', 'alterado', 'cancelado', 'concluido', 'excluido');

CREATE TABLE "agendamento_historicos" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "agendamentoId" TEXT,
    "autorId" TEXT NOT NULL,
    "acao" "AgendamentoHistoricoAcao" NOT NULL,
    "detalhe" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agendamento_historicos_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "agendamento_historicos"
ADD CONSTRAINT "agendamento_historicos_agendamentoId_fkey"
FOREIGN KEY ("agendamentoId") REFERENCES "agendamentos"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "agendamento_historicos"
ADD CONSTRAINT "agendamento_historicos_autorId_fkey"
FOREIGN KEY ("autorId") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "agendamento_historicos_tenantId_idx" ON "agendamento_historicos"("tenantId");
CREATE INDEX "agendamento_historicos_agendamentoId_createdAt_idx" ON "agendamento_historicos"("agendamentoId", "createdAt");
