ALTER TYPE "AgendamentoTipo" ADD VALUE IF NOT EXISTS 'retirada_chave';

ALTER TABLE "agendamentos" ADD COLUMN "empreendimentoId" TEXT;
ALTER TABLE "agendamentos" ADD COLUMN "muralChaveId" TEXT;
ALTER TABLE "agendamentos" ADD COLUMN "chaveRetiradaEm" TIMESTAMP(3);

CREATE INDEX "agendamentos_empreendimentoId_idx" ON "agendamentos"("empreendimentoId");
CREATE INDEX "agendamentos_muralChaveId_idx" ON "agendamentos"("muralChaveId");

ALTER TABLE "agendamentos"
  ADD CONSTRAINT "agendamentos_empreendimentoId_fkey"
  FOREIGN KEY ("empreendimentoId") REFERENCES "empreendimentos"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "agendamentos"
  ADD CONSTRAINT "agendamentos_muralChaveId_fkey"
  FOREIGN KEY ("muralChaveId") REFERENCES "mural_chaves"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
